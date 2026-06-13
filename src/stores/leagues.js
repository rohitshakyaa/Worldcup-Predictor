import { defineStore } from 'pinia'
import { supabase } from '../supabase.js'

const STORAGE_KEY = 'wc2026.currentLeague'

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export const useLeaguesStore = defineStore('leagues', {
  state: () => ({
    leagues: [],
    currentLeagueId: localStorage.getItem(STORAGE_KEY) || null,
    members: [],
    loading: false,
    error: ''
  }),
  getters: {
    currentLeague: (s) => s.leagues.find((l) => l.id === s.currentLeagueId) || null
  },
  actions: {
    setCurrent(id) {
      this.currentLeagueId = id
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
      this.loadMembers()
    },
    async loadMine() {
      this.loading = true
      this.error = ''
      try {
        const { data, error } = await supabase
          .from('leagues')
          .select('id, name, invite_code, owner_id, created_at')
          .order('created_at', { ascending: true })
        if (error) throw error
        this.leagues = data || []
        if (!this.currentLeagueId && this.leagues.length) this.setCurrent(this.leagues[0].id)
        else if (this.currentLeagueId && !this.leagues.find((l) => l.id === this.currentLeagueId)) {
          this.setCurrent(this.leagues[0]?.id || null)
        } else {
          this.loadMembers()
        }
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },
    async loadMembers() {
      if (!this.currentLeagueId) { this.members = []; return }
      // Fetch members, then their profiles separately (league_members.user_id
      // FKs to auth.users, not profiles, so we can't embed via PostgREST).
      const { data: mem, error } = await supabase
        .from('league_members')
        .select('user_id, joined_at')
        .eq('league_id', this.currentLeagueId)
      if (error) { this.members = []; return }
      const ids = (mem || []).map((m) => m.user_id)
      let pmap = {}
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles').select('id, display_name, email').in('id', ids)
        pmap = Object.fromEntries((profs || []).map((p) => [p.id, p]))
      }
      this.members = (mem || []).map((m) => ({ ...m, profiles: pmap[m.user_id] || null }))
    },
    async createLeague(name) {
      const { data: u } = await supabase.auth.getUser()
      const owner = u.user.id
      let code
      // Insert the league, then self-join as a member.
      const { data, error } = await supabase
        .from('leagues')
        .insert({ name, invite_code: (code = genCode()), owner_id: owner })
        .select()
        .single()
      if (error) throw error
      await supabase.from('league_members').insert({ league_id: data.id, user_id: owner })
      await this.loadMine()
      this.setCurrent(data.id)
      return data
    },
    async joinByCode(code) {
      const { data, error } = await supabase.rpc('join_league', { p_invite_code: code })
      if (error) throw error
      await this.loadMine()
      this.setCurrent(data)
      return data
    }
  }
})
