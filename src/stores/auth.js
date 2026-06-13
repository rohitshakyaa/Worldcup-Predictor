import { defineStore } from 'pinia'
import { supabase, isConfigured, ADMIN_EMAIL } from '../supabase.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    user: null,
    ready: false
  }),
  getters: {
    isLoggedIn: (s) => !!s.user,
    email: (s) => s.user?.email || '',
    displayName: (s) => s.user?.user_metadata?.display_name || s.user?.email || '',
    // Client-side admin flag (drives UI only). The DB independently enforces
    // admin writes via is_admin().
    isAdmin: (s) => !!s.user && (s.user.email || '').toLowerCase() === ADMIN_EMAIL
  },
  actions: {
    async init() {
      if (!isConfigured) { this.ready = true; return }
      const { data } = await supabase.auth.getSession()
      this.setSession(data.session)
      supabase.auth.onAuthStateChange((_e, session) => this.setSession(session))
      this.ready = true
    },
    setSession(session) {
      this.session = session
      this.user = session?.user || null
    },
    async signUp(email, password, displayName) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } }
      })
      if (error) throw error
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signOut() {
      await supabase.auth.signOut()
      this.setSession(null)
    }
  }
})
