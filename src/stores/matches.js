import { defineStore } from 'pinia'
import { supabase, RESULTS_URL } from '../supabase.js'
import { computeStandings, actualAdvancers } from '../lib/standings.js'
import { fetchResults } from '../lib/results.js'

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
    pretournamentLocked: (s) => s.config.pretournament_manual_lock === 'true'
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
      const { error } = await supabase.rpc('admin_save_result', {
        p_match_id: matchId, p_home: home, p_away: away, p_advancing: advancing, p_status: 'finished'
      })
      if (error) throw error
      await this.load()
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
    }
  }
})
