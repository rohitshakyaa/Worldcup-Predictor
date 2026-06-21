<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchesStore } from '../stores/matches.js'
import { usePredictionsStore } from '../stores/predictions.js'
import { useAuthStore } from '../stores/auth.js'
import FlagImg from '../components/FlagImg.vue'
import { formatDate } from '../lib/time.js'
import { matchFinished, formatPts } from '../lib/scoring.js'

const ms = useMatchesStore()
const ps = usePredictionsStore()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const myRows = computed(() => {
  const out = []
  for (const m of ms.matches) {
    const p = ps.myPredByMatch[m.id]
    if (!p) continue
    out.push({ m, p, score: ps.myMatchScore(m.id) })
  }
  // Latest kickoff first (no round grouping).
  return out.sort((a, b) => new Date(b.m.kickoff_utc) - new Date(a.m.kickoff_utc))
})

const myTotal = computed(() => {
  const row = ps.leaderboard.find((r) => r.userId === user.value?.id)
  return row || { group: 0, knockout: 0, advances: 0, champion: 0, total: 0 }
})
const team = (id) => ms.teamById[id]
</script>

<template>
  <div class="space-y-4">
    <div class="card p-3">
      <h2 class="font-display text-2xl font-bold">My picks</h2>
      <div class="mt-2 grid grid-cols-4 gap-2 text-center">
        <div><div class="text-xl font-bold">{{ myTotal.group }}</div><div class="label">Group</div></div>
        <div><div class="text-xl font-bold">{{ formatPts(myTotal.knockout) }}</div><div class="label">Knockout</div></div>
        <div><div class="text-xl font-bold">{{ myTotal.advances }}</div><div class="label">Advances</div></div>
        <div><div class="text-xl font-bold">{{ myTotal.champion }}</div><div class="label">Champion</div></div>
      </div>
      <div class="mt-2 text-center text-2xl font-extrabold text-brand">{{ formatPts(myTotal.total) }} pts</div>
    </div>

    <div v-if="!myRows.length" class="card p-4 text-sm text-muted">
      No predictions yet. Head to <strong>Matches</strong> to enter some.
    </div>

    <div v-else class="space-y-2">
      <div v-for="row in myRows" :key="row.m.id" class="card p-2.5">
        <div class="flex items-center justify-between text-xs text-muted">
          <span>{{ formatDate(row.m.kickoff_utc) }} · {{ row.m.round }}</span>
          <span v-if="row.score && row.score.total" class="chip-done">+{{ formatPts(row.score.total) }}</span>
        </div>
        <div class="mt-1 flex items-center gap-2 text-sm">
          <FlagImg :code="team(row.m.home_team_id)?.flag_code" size="w-5" />
          <span class="flex-1 truncate">{{ team(row.m.home_team_id)?.name || row.m.home_placeholder }}</span>
          <span class="font-bold tabular-nums">{{ row.p.home_pred }}–{{ row.p.away_pred }}</span>
          <span class="flex-1 truncate text-right">{{ team(row.m.away_team_id)?.name || row.m.away_placeholder }}</span>
          <FlagImg :code="team(row.m.away_team_id)?.flag_code" size="w-5" />
        </div>
        <div v-if="matchFinished(row.m)" class="mt-0.5 text-center text-xs text-muted">
          actual {{ row.m.home_score }}–{{ row.m.away_score }}
        </div>
      </div>
    </div>
  </div>
</template>
