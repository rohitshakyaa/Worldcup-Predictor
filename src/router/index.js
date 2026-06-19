import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

import AuthView from '../views/AuthView.vue'
import GroupsView from '../views/GroupsView.vue'
import MatchesView from '../views/MatchesView.vue'
import BracketView from '../views/BracketView.vue'
import MyPicksView from '../views/MyPicksView.vue'
import PlayerView from '../views/PlayerView.vue'
import LeaderboardView from '../views/LeaderboardView.vue'
import RulesView from '../views/RulesView.vue'
import AdminView from '../views/AdminView.vue'

const routes = [
  { path: '/', redirect: '/groups' },
  { path: '/login', component: AuthView, meta: { public: true } },
  { path: '/groups', component: GroupsView },
  { path: '/matches', component: MatchesView },
  { path: '/bracket', component: BracketView },
  { path: '/picks', component: MyPicksView },
  { path: '/player/:userId', component: PlayerView },
  { path: '/leaderboard', component: LeaderboardView },
  { path: '/rules', component: RulesView },
  { path: '/admin', component: AdminView, meta: { admin: true } }
]

// Hash history: portable to GitHub Pages subpaths, Netlify, and Vercel with no
// SPA-fallback configuration.
const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.ready) return true
  if (!to.meta.public && !auth.isLoggedIn) return '/login'
  if (to.path === '/login' && auth.isLoggedIn) return '/groups'
  if (to.meta.admin && !auth.isAdmin) return '/groups'
  return true
})

export default router
