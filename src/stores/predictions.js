import { defineStore } from 'pinia'
import { supabase } from '../supabase.js'
import { useMatchesStore } from './matches.js'
import { useLeaguesStore } from './leagues.js'
import { useAuthStore } from './auth.js'
import {
  scorePrediction, scoreAdvance, scoreExactPositions, scoreChampion, matchFinished,
  scoreKoReach, scoreThirds
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
    // ---- Current user's own data, keyed for quick editing ----
    myUserId: () => useAuthStore().user?.id,
    myPredByMatch(s) {
      const uid = this.myUserId
      const map = {}
      for (const p of s.predictions) if (p.user_id === uid) map[p.match_id] = p
      return map
    },
    myGroupOrder(s) {
      const uid = this.myUserId
      const out = {} // group -> [teamId pos1..4]
      for (const p of s.groupPicks) {
        if (p.user_id !== uid) continue
        ;(out[p.group_letter] ||= [])[p.predicted_position - 1] = p.team_id
      }
      return out
    },
    myChampion(s) {
      const uid = this.myUserId
      return s.championPicks.find((c) => c.user_id === uid)?.team_id || null
    },
    // { match_id: advancing_team_id } for the current user.
    myBracketByMatch(s) {
      const uid = this.myUserId
      const map = {}
      for (const b of s.bracketPicks) if (b.user_id === uid) map[b.match_id] = b.advancing_team_id
      return map
    },
    // { slot_match_id: team_id } for the current user.
    myThirdSlots(s) {
      const uid = this.myUserId
      const map = {}
      for (const t of s.thirdSlotPicks) if (t.user_id === uid) map[t.slot_match_id] = t.team_id
      return map
    },
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
      return final.home_score > final.away_score ? final.home_team_id : final.away_team_id
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

      // Champion.
      for (const c of this.championPicks) {
        const u = ensure(c.user_id)
        u.champion += scoreChampion(c.team_id, championId)
      }

      // Pre-tournament bracket: best-8 thirds + reach picks (added to "advances").
      const qualThirds = ms.standings.qualifiedThirdIds
      const actualReach = { r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() }
      for (const m of ms.matches) {
        if (!(m.stage in actualReach)) continue
        if (m.home_team_id) actualReach[m.stage].add(m.home_team_id)
        if (m.away_team_id) actualReach[m.stage].add(m.away_team_id)
      }
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

    // Per-match score breakdown for the current user (used in My Picks).
    myMatchScore() {
      const ms = useMatchesStore()
      return (matchId) => {
        const p = this.myPredByMatch[matchId]
        const m = ms.matchById[matchId]
        return p && m ? scorePrediction(p, m) : null
      }
    }
  },
  actions: {
    async loadForLeague(leagueId) {
      if (!leagueId) { this._clear(); return }
      this.error = ''
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
    async savePrediction(leagueId, matchId, home, away) {
      const { error } = await supabase.rpc('save_prediction', {
        p_league_id: leagueId, p_match_id: matchId, p_home: home, p_away: away
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
