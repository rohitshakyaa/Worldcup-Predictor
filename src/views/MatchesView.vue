<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchesStore } from '../stores/matches.js'
import { useAuthStore } from '../stores/auth.js'
import { useLeaguesStore } from '../stores/leagues.js'
import MatchCard from '../components/MatchCard.vue'

const ms = useMatchesStore()
const auth = useAuthStore()
const lg = useLeaguesStore()
const { isAdmin } = storeToRefs(auth)

const STAGES = [
  { key: 'group', label: 'Groups' },
  { key: 'r32', label: 'R32' },
  { key: 'r16', label: 'R16' },
  { key: 'qf', label: 'QF' },
  { key: 'sf', label: 'SF' },
  { key: 'third_place', label: '3rd' },
  { key: 'final', label: 'Final' }
]
const stage = ref('group')
const groupFilter = ref('all')

const list = computed(() => {
  let rows = ms.matchesByStage[stage.value] || []
  if (stage.value === 'group' && groupFilter.value !== 'all') {
    rows = rows.filter((m) => m.group_letter === groupFilter.value)
  }
  return rows
})

// ---- Admin: refresh results from official JSON ----
const suggestions = ref(null)
const refreshing = ref(false)
const refreshErr = ref('')
async function refresh() {
  refreshErr.value = ''; refreshing.value = true
  try { suggestions.value = await ms.fetchSuggestions() }
  catch (e) { refreshErr.value = e.message }
  finally { refreshing.value = false }
}
async function applyOne(s) {
  await ms.saveResult(s.match.id, s.home_score, s.away_score)
  suggestions.value = suggestions.value.filter((x) => x.match_no !== s.match_no)
}
async function applyAll() {
  for (const s of [...suggestions.value]) await applyOne(s)
}
</script>

<template>
  <div class="space-y-3">
    <div v-if="!lg.currentLeagueId" class="card p-4 text-sm text-muted">
      Join or create a league (top-right) to enter predictions.
    </div>

    <div class="flex items-center gap-2 overflow-x-auto pb-1">
      <button
        v-for="s in STAGES" :key="s.key"
        class="btn-ghost btn-sm whitespace-nowrap"
        :class="{ '!bg-brand !text-brand-ink': stage === s.key }"
        @click="stage = s.key"
      >{{ s.label }}</button>
    </div>

    <select v-if="stage==='group'" v-model="groupFilter" class="input">
      <option value="all">All groups</option>
      <option v-for="g in ms.groupLetters" :key="g" :value="g">Group {{ g }}</option>
    </select>

    <!-- Admin refresh -->
    <div v-if="isAdmin" class="card p-3 space-y-2">
      <div class="flex items-center gap-2">
        <button class="btn-ghost btn-sm" :disabled="refreshing" @click="refresh">
          {{ refreshing ? 'Fetching…' : '↻ Refresh results' }}
        </button>
        <span class="text-xs text-muted">Suggestions from official JSON; you confirm.</span>
      </div>
      <p v-if="refreshErr" class="text-xs text-red-500">{{ refreshErr }}</p>
      <div v-if="suggestions && suggestions.length" class="space-y-1">
        <button class="btn-brand btn-sm" @click="applyAll">Apply all ({{ suggestions.length }})</button>
        <div v-for="s in suggestions" :key="s.match_no" class="flex items-center justify-between text-sm">
          <span>#{{ s.match_no }} → {{ s.home_score }}–{{ s.away_score }}</span>
          <button class="btn-ghost btn-sm" @click="applyOne(s)">Apply</button>
        </div>
      </div>
      <p v-else-if="suggestions" class="text-xs text-muted">No new results to apply.</p>
    </div>

    <div class="space-y-2">
      <MatchCard v-for="m in list" :key="m.id" :match="m" />
    </div>
  </div>
</template>
