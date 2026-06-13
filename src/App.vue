<script setup>
import { watch, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { isConfigured } from './supabase.js'
import { useAuthStore } from './stores/auth.js'
import { useLeaguesStore } from './stores/leagues.js'
import { useMatchesStore } from './stores/matches.js'
import { usePredictionsStore } from './stores/predictions.js'
import BottomNav from './components/BottomNav.vue'
import LeagueBar from './components/LeagueBar.vue'
import Icon from './components/Icon.vue'

const auth = useAuthStore()
const lg = useLeaguesStore()
const ms = useMatchesStore()
const ps = usePredictionsStore()
const router = useRouter()
const { isLoggedIn, isAdmin, email, displayName } = storeToRefs(auth)
const { currentLeagueId } = storeToRefs(lg)

onMounted(async () => {
  if (isConfigured && isLoggedIn.value) await bootData()
})

watch(isLoggedIn, async (v) => {
  if (v) await bootData()
})
watch(currentLeagueId, async (id) => { await ps.loadForLeague(id) })

async function bootData() {
  await Promise.all([ms.load(), lg.loadMine()])
  await ps.loadForLeague(currentLeagueId.value)
}

async function signOut() {
  await auth.signOut()
  router.push('/login')
}

const showShell = computed(() => isConfigured && isLoggedIn.value)
</script>

<template>
  <!-- Not configured: friendly setup notice -->
  <div v-if="!isConfigured" class="app-shell">
    <div class="content flex items-center">
      <div class="card p-6 space-y-3 animate-rise">
        <h1 class="text-2xl font-bold">World Cup 2026 Predictor</h1>
        <p class="text-muted">This app isn't configured yet.</p>
        <ol class="list-decimal pl-5 text-sm space-y-1 text-ink/90">
          <li>Create a Supabase project; run <code>schema.sql</code> then <code>seed.sql</code>.</li>
          <li>Set <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, <code>VITE_ADMIN_EMAIL</code>.</li>
          <li>Restart / redeploy.</li>
        </ol>
        <p class="text-xs text-muted">See <code>README.md</code> for full setup.</p>
      </div>
    </div>
  </div>

  <div v-else class="app-shell">
    <header v-if="showShell" class="safe-top sticky top-0 z-30 border-b bar px-4 py-2.5">
      <div class="mx-auto flex max-w-app items-center gap-2">
        <span class="font-display text-xl font-bold tracking-wide">
          WC<span class="text-brand">26</span>
        </span>
        <span v-if="isAdmin" class="chip-live"><Icon name="shield" :size="12" /> admin</span>
        <div class="ml-auto flex items-center gap-1.5">
          <RouterLink to="/rules" class="btn-ghost btn-sm !px-2.5" title="Rules & scoring" aria-label="Rules">
            <Icon name="book" :size="16" />
          </RouterLink>
          <LeagueBar />
          <button class="btn-ghost btn-sm !px-2.5" @click="signOut" :title="email" aria-label="Sign out">
            <Icon name="logout" :size="16" />
          </button>
        </div>
      </div>
      <div class="mx-auto mt-1 flex max-w-app items-center gap-1.5 text-xs text-muted">
        <Icon name="user" :size="13" />
        <span class="font-semibold text-ink truncate">{{ displayName }}</span>
        <span v-if="email && email !== displayName" class="truncate">· {{ email }}</span>
      </div>
    </header>

    <main class="content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>

    <BottomNav v-if="showShell" />
  </div>
</template>
