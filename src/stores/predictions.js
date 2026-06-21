import { defineStore } from 'pinia'
import { supabase } from '../supabase.js'
import { useMatchesStore } from './matches.js'
import { useLeaguesStore } from './leagues.js'
import { useAuthStore } from './auth.js'
import {
  scorePrediction, scoreAdvance, scoreExactPositions, scoreChampion, matchFinished,
  scoreKoReach, scoreThirds, THIRD_PLACE_WIN_PTS
} from '../lib/scoring.js'

// stage -> the round a winner of that stage REACHES next.
const NEXT_ROUND = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' }

export const usePredictionsStore = defineStore('predictions', {
  state: () => ({
    predictions: [],        // all members, current league
    groupPicks: [],         // group_position_picks
    knockoutPicks: [],      // knockout_picks (legacy display reach)
    championPicks: [],      // champion_picks
    bracketPicks: [],       // bracket_picks (advancer per KO match)
    thirdSlotPicks: [],     // third_slot_picks (third assigned per R32 slot)
    loaded: false,
    error: ''
  }),
  getters: {
    // ---- Per-user accessors (work for any member of the loaded league) ----
    myUserId: () => useAuthStore().user?.id,
    // { match_id: prediction } for a given user.
    predByMatchFor(s) {
      return (uid) => {
        const map = {}
        for (const p of s.predictions) if (p.user_id === uid) map[p.match_id] = p
        return map
      }
    },
    // group -> [teamId pos1..4] for a given user.
    groupOrderFor(s) {
      return (uid) => {
        const out = {}
        for (const p of s.groupPicks) {
          if (p.user_id !== uid) continue
          ;(out[p.group_letter] ||= [])[p.predicted_position - 1] = p.team_id
        }
        return out
      }
    },
    // Champion = the team the player picked to win the final (single source of
    // truth — derived from the connected bracket, not a separate pick).
    championFor() {
      return (uid) => {
        const ms = useMatchesStore()
        const final = ms.matches.find((m) => m.stage === 'final')
        if (!final) return null
        return this.bracketByMatchFor(uid)[final.id] ?? null
      }
    },
    // Third-place winner the player picked (bracket pick on the 3rd-place match).
    thirdPlacePickFor() {
      return (uid) => {
        const ms = useMatchesStore()
        const tp = ms.matches.find((m) => m.stage === 'third_place')
        if (!tp) return null
        return this.bracketByMatchFor(uid)[tp.id] ?? null
      }
    },
    // { match_id: advancing_team_id } for a given user.
    bracketByMatchFor(s) {
      return (uid) => {
        const map = {}
        for (const b of s.bracketPicks) if (b.user_id === uid) map[b.match_id] = b.advancing_team_id
        return map
      }
    },
    // { slot_match_id: team_id } for a given user.
    thirdSlotsFor(s) {
      return (uid) => {
        const map = {}
        for (const t of s.thirdSlotPicks) if (t.user_id === uid) map[t.slot_match_id] = t.team_id
        return map
      }
    },

    // ---- Current user's own data (delegates to the *For accessors) ----
    myPredByMatch() { return this.predByMatchFor(this.myUserId) },
    myGroupOrder() { return this.groupOrderFor(this.myUserId) },
    myChampion() { return this.championFor(this.myUserId) },
    myThirdPlace() { return this.thirdPlacePickFor(this.myUserId) },
    myBracketByMatch() { return this.bracketByMatchFor(this.myUserId) },
    myThirdSlots() { return this.thirdSlotsFor(this.myUserId) },
    myKnockoutByRound(s) {
      const uid = this.myUserId
      const out = {}
      for (const k of s.knockoutPicks) {
        if (k.user_id !== uid) continue
        ;(out[k.round] ||= new Set()).add(k.team_id)
      }
      return out
    },

    // ---- Actual champion (winner of the final) ----
    actualChampionId() {
      const ms = useMatchesStore()
      const final = ms.matches.find((m) => m.stage === 'final')
      if (!final || !matchFinished(final)) return null
      // A final level at 90' is decided on pens/ET — the admin records the winner.
      if (final.home_score === final.away_score) return final.advancing_team_id ?? null
      return final.home_score > final.away_score ? final.home_team_id : final.away_team_id
    },

    // ---- Actual third-place play-off winner ----
    actualThirdPlaceId() {
      const ms = useMatchesStore()
      const tp = ms.matches.find((m) => m.stage === 'third_place')
      if (!tp || !matchFinished(tp)) return null
      if (tp.home_score === tp.away_score) return tp.advancing_team_id ?? null
      return tp.home_score > tp.away_score ? tp.home_team_id : tp.away_team_id
    },

    // ---- Actual qualified best-8 thirds (override-aware), or null if undecided ----
    // Undecided until EVERY group match is finished — the thirds aren't real
    // before then, even if the admin pre-saved an override. Uses the admin's
    // chosen groups when present, else the live standings ranking.
    actualQualifiedThirdIds() {
      const ms = useMatchesStore()
      if (!ms.allGroupsComplete) return null
      const override = ms.qualifiedThirdsOverride
      if (override) {
        const ids = new Set()
        for (const g of override) {
          const tid = ms.standings.groups[g]?.[2]?.teamId
          if (tid != null) ids.add(tid)
        }
        return ids
      }
      return ms.standings.qualifiedThirdIds
    },

    // ---- Teams that actually REACHED each KO round (from resolved matchups) ----
    actualReachByRound() {
      const ms = useMatchesStore()
      const reach = { r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() }
      for (const m of ms.matches) {
        if (!(m.stage in reach)) continue
        if (m.home_team_id) reach[m.stage].add(m.home_team_id)
        if (m.away_team_id) reach[m.stage].add(m.away_team_id)
      }
      return reach
    },

    // ---- Leaderboard rows with breakdown ----
    leaderboard() {
      const ms = useMatchesStore()
      const lg = useLeaguesStore()
      const advancers = ms.advancers
      const championId = this.actualChampionId

      // Group members by user.
      const users = {}
      for (const m of lg.members) {
        users[m.user_id] = {
          userId: m.user_id,
          name: m.profiles?.display_name || m.profiles?.email || 'Player',
          group: 0, knockout: 0, advances: 0, champion: 0, total: 0,
          exact: 0, closest: 0
        }
      }
      const ensure = (id) => (users[id] ||= { userId: id, name: 'Player', group: 0, knockout: 0, advances: 0, champion: 0, total: 0, exact: 0, closest: 0 })

      // Per-match prediction scoring.
      for (const p of this.predictions) {
        const match = ms.matchById[p.match_id]
        if (!match) continue
        const sc = scorePrediction(p, match)
        if (!sc.total) continue
        const u = ensure(p.user_id)
        if (match.stage === 'group') u.group += sc.total
        else u.knockout += sc.total
        u.exact += sc.exact ? 1 : 0
        u.closest += sc.closest ? 1 : 0
      }

      // Advance picks (top-2 of each group ordering).
      const orders = {} // user -> group -> [ids]
      for (const gp of this.groupPicks) {
        ;((orders[gp.user_id] ||= {})[gp.group_letter] ||= [])[gp.predicted_position - 1] = gp.team_id
      }
      for (const uid of Object.keys(orders)) {
        const u = ensure(uid)
        for (const g of Object.keys(orders[uid])) {
          const order = orders[uid][g]
          const top2 = [order[0], order[1]].filter((x) => x != null)
          if (advancers[g]) u.advances += scoreAdvance(top2, advancers[g])
          if (ms.standings.groups[g]) {
            const actualOrder = ms.standings.groups[g].map((r) => r.teamId)
            u.advances += scoreExactPositions(order, actualOrder)
          }
        }
      }

      // Champion = winner of the final in each player's connected bracket.
      const finalMatch = ms.matches.find((m) => m.stage === 'final')
      if (finalMatch) {
        for (const b of this.bracketPicks) {
          if (b.match_id !== finalMatch.id) continue
          ensure(b.user_id).champion += scoreChampion(b.advancing_team_id, championId)
        }
      }

      // Third-place play-off winner pick → counts as an advance point.
      const tpMatch = ms.matches.find((m) => m.stage === 'third_place')
      if (tpMatch) {
        const actualTp = this.actualThirdPlaceId
        for (const b of this.bracketPicks) {
          if (b.match_id !== tpMatch.id) continue
          if (actualTp != null && b.advancing_team_id === actualTp) ensure(b.user_id).advances += THIRD_PLACE_WIN_PTS
        }
      }

      // Pre-tournament bracket: best-8 thirds + reach picks (added to "advances").
      // Honour the admin's qualified-thirds override so player scoring matches
      // exactly what was resolved into the bracket.
      const qualThirds = this.actualQualifiedThirdIds || new Set()
      const actualReach = this.actualReachByRound
      const predReach = {}
      for (const b of this.bracketPicks) {
        const mt = ms.matchById[b.match_id]
        const round = mt && NEXT_ROUND[mt.stage]
        if (!round) continue
        const pr = (predReach[b.user_id] ||= { r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() })
        pr[round].add(b.advancing_team_id)
      }
      for (const uid of Object.keys(predReach)) {
        const u = ensure(uid)
        for (const round of ['r16', 'qf', 'sf', 'final']) {
          u.advances += scoreKoReach(round, predReach[uid][round], actualReach[round])
        }
      }
      const thirdsByUser = {}
      for (const t of this.thirdSlotPicks) (thirdsByUser[t.user_id] ||= new Set()).add(t.team_id)
      for (const uid of Object.keys(thirdsByUser)) {
        ensure(uid).advances += scoreThirds(thirdsByUser[uid], qualThirds)
      }

      // Advance/third/reach points are shown but only counted in the total once
      // the admin enables accumulation (e.g. after the tournament).
      const countAdv = ms.accumulateAdvance
      const rows = Object.values(users)
      for (const r of rows) r.total = r.group + r.knockout + r.champion + (countAdv ? r.advances : 0)
      rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      return rows
    },

    // Per-match score breakdown for any user (used in My Picks / Player view).
    matchScoreFor() {
      const ms = useMatchesStore()
      return (uid, matchId) => {
        const p = this.predByMatchFor(uid)[matchId]
        const m = ms.matchById[matchId]
        return p && m ? scorePrediction(p, m) : null
      }
    },
    // Per-match score breakdown for the current user.
    myMatchScore() {
      return (matchId) => this.matchScoreFor(this.myUserId, matchId)
    }
  },
  actions: {
    async loadForLeague(leagueId) {
      if (!leagueId) { this._clear(); return }
      this.error = ''
      // NOTE: this pulls every member's picks for the league, so all opponents'
      // predictions are present client-side regardless of lock state. The Player
      // view's "hidden until locked" rule is a UI gate only — not a security
      // boundary. If picks must stay truly private until lock, enforce it with
      // Supabase RLS (return another user's rows only once the match/bracket is
      // locked) as a follow-up.
      try {
        const [pred, gp, kp, cp, bp, ts] = await Promise.all([
          supabase.from('predictions').select('*').eq('league_id', leagueId),
          supabase.from('group_position_picks').select('*').eq('league_id', leagueId),
          supabase.from('knockout_picks').select('*').eq('league_id', leagueId),
          supabase.from('champion_picks').select('*').eq('league_id', leagueId),
          supabase.from('bracket_picks').select('*').eq('league_id', leagueId),
          supabase.from('third_slot_picks').select('*').eq('league_id', leagueId)
        ])
        this.predictions = pred.data || []
        this.groupPicks = gp.data || []
        this.knockoutPicks = kp.data || []
        this.championPicks = cp.data || []
        this.bracketPicks = bp.data || []
        this.thirdSlotPicks = ts.data || []
        this.loaded = true
      } catch (e) {
        this.error = e.message
      }
    },
    _clear() {
      this.predictions = []; this.groupPicks = []; this.knockoutPicks = []
      this.championPicks = []; this.bracketPicks = []; this.thirdSlotPicks = []
    },
    async savePrediction(leagueId, matchId, home, away, advancing = null) {
      const { error } = await supabase.rpc('save_prediction', {
        p_league_id: leagueId, p_match_id: matchId, p_home: home, p_away: away, p_advancing: advancing
      })
      if (error) throw error
      await this.loadForLeague(leagueId)
    },
    async saveGroupPositions(leagueId, group, teamIds) {
      const { error } = await supabase.rpc('save_group_positions', {
        p_league_id: leagueId, p_group: group, p_team_ids: teamIds
      })
      if (error) throw error
      await this.loadForLeague(leagueId)
    },
    async saveKnockoutPicks(leagueId, round, teamIds) {
      const { error } = await supabase.rpc('save_knockout_picks', {
        p_league_id: leagueId, p_round: round, p_team_ids: teamIds
      })
      if (error) throw error
      await this.loadForLeague(leagueId)
    },
    async saveChampion(leagueId, teamId) {
      const { error } = await supabase.rpc('save_champion_pick', {
        p_league_id: leagueId, p_team_id: teamId
      })
      if (error) throw error
      await this.loadForLeague(leagueId)
    },
    // advancingTeamId = null clears the pick.
    async saveBracketPick(leagueId, matchId, advancingTeamId) {
      const { error } = await supabase.rpc('save_bracket_pick', {
        p_league_id: leagueId, p_match_id: matchId, p_advancing_team_id: advancingTeamId ?? null
      })
      if (error) throw error
      const i = this.bracketPicks.findIndex((b) => b.user_id === this.myUserId && b.match_id === matchId)
      if (advancingTeamId == null) {
        if (i >= 0) this.bracketPicks.splice(i, 1)
      } else if (i >= 0) {
        this.bracketPicks[i].advancing_team_id = advancingTeamId
      } else {
        this.bracketPicks.push({ league_id: leagueId, user_id: this.myUserId, match_id: matchId, advancing_team_id: advancingTeamId })
      }
    },
    async saveThirdSlot(leagueId, slotMatchId, teamId) {
      const { error } = await supabase.rpc('save_third_slot', {
        p_league_id: leagueId, p_slot_match_id: slotMatchId, p_team_id: teamId
      })
      if (error) throw error
      this.thirdSlotPicks = this.thirdSlotPicks.filter(
        (t) => !(t.user_id === this.myUserId && t.slot_match_id === slotMatchId)
      )
      if (teamId != null) {
        this.thirdSlotPicks.push({ league_id: leagueId, user_id: this.myUserId, slot_match_id: slotMatchId, team_id: teamId })
      }
    }
  }
})
