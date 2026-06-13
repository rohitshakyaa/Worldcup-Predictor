<script setup>
import { computed } from 'vue'
import { usePredictionsStore } from '../stores/predictions.js'
import { useLeaguesStore } from '../stores/leagues.js'

const ps = usePredictionsStore()
const lg = useLeaguesStore()
const rows = computed(() => ps.leaderboard)
const medal = (i) => ['🥇', '🥈', '🥉'][i] || ''
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold">Leaderboard</h2>
      <span v-if="lg.currentLeague" class="text-xs text-muted">{{ lg.currentLeague.name }}</span>
    </div>

    <div v-if="!lg.currentLeagueId" class="card p-4 text-sm text-muted">
      Join or create a league to see a leaderboard.
    </div>

    <div v-else class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-brand/5 text-left text-xs text-muted">
            <th class="py-2 pl-3">#</th>
            <th class="py-2">Player</th>
            <th class="py-2 px-1 text-center">Grp</th>
            <th class="py-2 px-1 text-center">KO</th>
            <th class="py-2 px-1 text-center">Adv</th>
            <th class="py-2 px-1 text-center">Cha</th>
            <th class="py-2 pr-3 text-center font-bold">Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.userId" class="border-t border-line">
            <td class="py-2 pl-3 tabular-nums">{{ medal(i) || (i + 1) }}</td>
            <td class="py-2 font-medium truncate max-w-[8rem]">{{ r.name }}</td>
            <td class="py-2 px-1 text-center tabular-nums text-muted">{{ r.group }}</td>
            <td class="py-2 px-1 text-center tabular-nums text-muted">{{ r.knockout }}</td>
            <td class="py-2 px-1 text-center tabular-nums text-muted">{{ r.advances }}</td>
            <td class="py-2 px-1 text-center tabular-nums text-muted">{{ r.champion }}</td>
            <td class="py-2 pr-3 text-center font-extrabold tabular-nums text-brand">{{ r.total }}</td>
          </tr>
          <tr v-if="!rows.length"><td colspan="7" class="py-4 text-center text-muted">No members yet.</td></tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-muted">
      Breakdown: Grp = group results · KO = knockout results · Adv = correct advancers (+5 each) · Cha = champion (+10).
    </p>
  </div>
</template>
