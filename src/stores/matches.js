import { defineStore } from 'pinia'
import { supabase, RESULTS_URL } from '../supabase.js'
import { computeStandings, actualAdvancers } from '../lib/standings.js'
import { fetchResults } from '../lib/results.js'
import { matchFinished } from '../lib/scoring.js'
import { routeThirds } from '../lib/annexC.js'

const STAGE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final']

export const useMatchesStore = defineStore('matches', {
  state: () => ({
    teams: [],
    matches: [],
    config: {},
    loaded: false,
    refreshMsg: ''
  }),
  getters: {
    teamById: (s) => {
      const map = {}
      for (const t of s.teams) map[t.id] = t
      return map
    },
    teamsByGroup: (s) => {
      const g = {}
      for (const t of s.teams) (g[t.group_letter] ||= []).push(t)
      return g
    },
    groupLetters: (s) => [...new Set(s.teams.map((t) => t.group_letter).filter(Boolean))].sort(),
    matchById: (s) => {
      const m = {}
      for (const x of s.matches) m[x.id] = x
      return m
    },
    matchesByStage: (s) => {
      const out = {}
      for (const st of STAGE_ORDER) out[st] = []
      for (const m of s.matches) (out[m.stage] ||= []).push(m)
      // Sort each stage by kickoff time (then match_no as a stable tiebreak).
      const byTime = (a, b) =>
        new Date(a.kickoff_utc) - new Date(b.kickoff_utc) || a.match_no - b.match_no
      for (const st of Object.keys(out)) out[st].sort(byTime)
      return out
    },
    standings: (s) => computeStandings(s.teams, s.matches),
    advancers() {
      return actualAdvancers(this.standings)
    },
    isLocked: () => (m) => m.manual_lock || Date.now() >= new Date(m.kickoff_utc).getTime(),
    pretournamentLocked: (s) => s.config.pretournament_manual_lock === 'true',
    accumulateAdvance: (s) => s.config.accumulate_advance === 'true',
    // True once every group-stage match of group g is finished (top-2 final).
    groupComplete() {
      return (g) => {
        const ms = this.matchesByStage.group.filter((m) => m.group_letter === g)
        return ms.length > 0 && ms.every((m) => matchFinished(m))
      }
    },
    allGroupsComplete() {
      return this.groupLetters.length > 0 && this.groupLetters.every((g) => this.groupComplete(g))
    },
    // Admin override of the qualified third-place groups (array of letters), or null.
    qualifiedThirdsOverride: (s) => {
      const raw = s.config.qualified_thirds
      if (!raw) return null
      try { const a = JSON.parse(raw); return Array.isArray(a) && a.length ? a : null } catch { return null }
    }
  },
  actions: {
    async load() {
      const [{ data: teams }, { data: matches }, { data: config }] = await Promise.all([
        supabase.from('teams').select('*').order('id'),
        supabase.from('matches').select('*').order('match_no'),
        supabase.from('app_config').select('*')
      ])
      this.teams = teams || []
      this.matches = matches || []
      this.config = Object.fromEntries((config || []).map((c) => [c.key, c.value]))
      this.loaded = true
    },
    async setPretournamentLock(locked) {
      const { error } = await supabase.rpc('admin_set_pretournament_lock', { p_locked: locked })
      if (error) throw error
      this.config = { ...this.config, pretournament_manual_lock: locked ? 'true' : 'false' }
    },
    async setAccumulateAdvance(on) {
      const { error } = await supabase.rpc('admin_set_accumulate_advance', { p_on: on })
      if (error) throw error
      this.config = { ...this.config, accumulate_advance: on ? 'true' : 'false' }
    },
    // Admin: fetch the official results JSON and return a list of suggested
    // updates (match_no + new score) for finished matches that differ from
    // what's stored. The admin reviews then confirms each via saveResult().
    async fetchSuggestions() {
      const feed = await fetchResults(RESULTS_URL)
      const suggestions = []
      for (const m of this.matches) {
        const f = feed[m.match_no]
        if (!f) continue
        const changed = m.home_score !== f.home_score || m.away_score !== f.away_score || m.status !== 'finished'
        if (changed) suggestions.push({ match_no: m.match_no, match: m, ...f })
      }
      return suggestions
    },
    async saveResult(matchId, home, away, advancing = null) {
      const match = this.matchById[matchId]
      // KO winner: higher score, or the supplied advancer when level (pens/ET).
      let winner = advancing
      if (match && match.stage !== 'group') {
        if (home > away) winner = match.home_team_id
        else if (away > home) winner = match.away_team_id
      }
      const { error } = await supabase.rpc('admin_save_result', {
        p_match_id: matchId, p_home: home, p_away: away,
        p_advancing: match && match.stage !== 'group' ? winner : null, p_status: 'finished'
      })
      if (error) throw error
      // Push the winner (and, for semis, the loser) into the next round's slot —
      // one level only; never null out an already-resolved team.
      if (match && match.stage !== 'group' && winner) {
        const loser = winner === match.home_team_id ? match.away_team_id : match.home_team_id
        await this.autoAdvance(match.match_no, winner, loser)
      }
      await this.load()
    },
    // Resolve the next match(es) that reference this match via W{n}/L{n}.
    async autoAdvance(matchNo, winner, loser) {
      const wTag = `W${matchNo}`
      const lTag = `L${matchNo}`
      for (const nx of this.matches) {
        const homeFill = nx.home_placeholder === wTag ? winner : nx.home_placeholder === lTag ? loser : null
        const awayFill = nx.away_placeholder === wTag ? winner : nx.away_placeholder === lTag ? loser : null
        if (homeFill == null && awayFill == null) continue
        // Keep the side we're not filling at its current value (may be null).
        const h = homeFill != null ? homeFill : nx.home_team_id
        const a = awayFill != null ? awayFill : nx.away_team_id
        const { error } = await supabase.rpc('admin_set_ko_teams', {
          p_match_id: nx.id, p_home_team: h ?? null, p_away_team: a ?? null
        })
        if (error) throw error
      }
    },
    async setMatchLock(matchId, locked) {
      const { error } = await supabase.rpc('admin_set_match_lock', { p_match_id: matchId, p_locked: locked })
      if (error) throw error
      await this.load()
    },
    async setStageLock(stage, locked) {
      const { error } = await supabase.rpc('admin_set_stage_lock', { p_stage: stage, p_locked: locked })
      if (error) throw error
      await this.load()
    },
    async setKoTeams(matchId, homeTeamId, awayTeamId) {
      const { error } = await supabase.rpc('admin_set_ko_teams', {
        p_match_id: matchId, p_home_team: homeTeamId, p_away_team: awayTeamId
      })
      if (error) throw error
      await this.load()
    },
    // Admin: persist which 8 third-placed groups qualified (array of letters).
    async setQualifiedThirds(groupLetters) {
      const { error } = await supabase.rpc('admin_set_qualified_thirds', { p_groups: groupLetters })
      if (error) throw error
      this.config = { ...this.config, qualified_thirds: JSON.stringify(groupLetters) }
    },
    // Admin: fill all 16 R32 matchups from actual standings + Annexe C routing
    // of the qualified thirds. Group winners/runners-up come from the live
    // standings order; third-place slots from routeThirds(chosen 8).
    async resolveR32(qualifiedGroups) {
      if (!this.allGroupsComplete) throw new Error('All group matches must be finished first')
      const route = routeThirds(qualifiedGroups) // { slotMatchId: sourceGroupLetter } or null
      if (!route) throw new Error('Pick exactly 8 qualified thirds first')
      const groups = this.standings.groups
      const teamFor = (ph, matchId) => {
        let m
        if ((m = /^([12])([A-L])$/.exec(ph))) return groups[m[2]]?.[+m[1] - 1]?.teamId ?? null
        if (/^3/.test(ph)) { const g = route[matchId]; return g ? (groups[g]?.[2]?.teamId ?? null) : null }
        return null
      }
      for (const mt of this.matchesByStage.r32 || []) {
        const h = teamFor(mt.home_placeholder, mt.id)
        const a = teamFor(mt.away_placeholder, mt.id)
        const { error } = await supabase.rpc('admin_set_ko_teams', {
          p_match_id: mt.id, p_home_team: h, p_away_team: a
        })
        if (error) throw error
      }
      await this.load()
    },
    // Admin: clear all R32 fixtures back to placeholders (undo an early resolve).
    async unresolveR32() {
      for (const mt of this.matchesByStage.r32 || []) {
        if (!mt.home_team_id && !mt.away_team_id) continue
        const { error } = await supabase.rpc('admin_set_ko_teams', {
          p_match_id: mt.id, p_home_team: null, p_away_team: null
        })
        if (error) throw error
      }
      await this.load()
    }
  }
})
