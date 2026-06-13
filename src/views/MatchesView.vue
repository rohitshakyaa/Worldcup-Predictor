<script setup>
import { ref, computed } from 'vue'
import { useMatchesStore } from '../stores/matches.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { matchFinished } from '../lib/scoring.js'
import MatchCard from '../components/MatchCard.vue'

const ms = useMatchesStore()
const lg = useLeaguesStore()

const STAGES = [
  { key: 'group', label: 'Groups' }, { key: 'r32', label: 'R32' }, { key: 'r16', label: 'R16' },
  { key: 'qf', label: 'QF' }, { key: 'sf', label: 'SF' }, { key: 'third_place', label: '3rd' }, { key: 'final', label: 'Final' }
]
const stage = ref('group')
const groupFilter = ref('all')
const view = ref('all') // all | remaining | final
const VIEWS = [{ k: 'all', l: 'All' }, { k: 'remaining', l: 'Remaining' }, { k: 'final', l: 'Final' }]

const list = computed(() => {
  let rows = ms.matchesByStage[stage.value] || []
  if (stage.value === 'group' && groupFilter.value !== 'all') rows = rows.filter((m) => m.group_letter === groupFilter.value)
  if (view.value === 'remaining') rows = rows.filter((m) => !ms.isLocked(m))
  else if (view.value === 'final') rows = rows.filter((m) => matchFinished(m))
  // Still-predictable (not locked) on top, soonest first; locked/passed below.
  return rows.slice().sort((a, b) => {
    const la = ms.isLocked(a) ? 1 : 0
    const lb = ms.isLocked(b) ? 1 : 0
    if (la !== lb) return la - lb
    return new Date(a.kickoff_utc) - new Date(b.kickoff_utc)
  })
})
</script>

<template>
  <div class="space-y-3">
    <h2 class="font-display text-2xl font-bold">Matches</h2>

    <div v-if="!lg.currentLeagueId" class="card p-4 text-sm text-muted">
      Join or create a league (top-right) to enter predictions.
    </div>

    <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
      <button v-for="s in STAGES" :key="s.key" class="btn-ghost btn-sm whitespace-nowrap"
        :class="{ '!bg-brand !text-brand-ink': stage === s.key }" @click="stage = s.key">{{ s.label }}</button>
    </div>

    <div class="flex items-center gap-2">
      <div class="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
        <button v-for="v in VIEWS" :key="v.k" class="rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-200"
          :class="view === v.k ? 'bg-brand text-brand-ink' : 'text-muted'" @click="view = v.k">{{ v.l }}</button>
      </div>
      <select v-if="stage==='group'" v-model="groupFilter" class="input !py-2 text-sm flex-1">
        <option value="all">All groups</option>
        <option v-for="g in ms.groupLetters" :key="g" :value="g">Group {{ g }}</option>
      </select>
    </div>

    <div class="space-y-2">
      <MatchCard v-for="m in list" :key="m.id" :match="m" />
    </div>
  </div>
</template>
