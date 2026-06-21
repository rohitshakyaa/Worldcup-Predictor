<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import Icon from '../components/Icon.vue'
import { usePredictionsStore } from '../stores/predictions.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { useAuthStore } from '../stores/auth.js'
import { useMatchesStore } from '../stores/matches.js'
import { formatPts } from '../lib/scoring.js'

const ps = usePredictionsStore()
const lg = useLeaguesStore()
const ms = useMatchesStore()
const { user } = storeToRefs(useAuthStore())
const countAdv = computed(() => ms.accumulateAdvance)

const router = useRouter()
const rows = computed(() => ps.leaderboard)
const me = computed(() => user.value?.id)
// Your own entry opens your editable picks; everyone else opens their read-only page.
const openPlayer = (userId) => {
  if (!userId) return
  router.push(userId === me.value ? '/picks' : `/player/${userId}`)
}
const podium = computed(() => {
  const r = rows.value
  // visual order: 2nd, 1st, 3rd
  return [r[1], r[0], r[2]].map((row, i) => ({ row, place: [2, 1, 3][i] }))
})
const medalColor = { 1: 'text-gold', 2: 'text-silver', 3: 'text-bronze' }
const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-2xl font-bold">Leaderboard</h2>
      <span v-if="lg.currentLeague" class="chip-muted">{{ lg.currentLeague.name }}</span>
    </div>

    <div v-if="!lg.currentLeagueId" class="card p-4 text-sm text-muted">Join or create a league to see a leaderboard.</div>

    <template v-else>
      <!-- Podium -->
      <div v-if="rows.length" class="card p-4">
        <div class="grid grid-cols-3 items-end gap-2">
          <div v-for="(p, i) in podium" :key="i" class="flex flex-col items-center"
               :class="{ 'cursor-pointer': p.row }" @click="openPlayer(p.row?.userId)">
            <template v-if="p.row">
              <div class="relative">
                <div class="flex items-center justify-center rounded-full border border-white/15 bg-white/5 font-display font-bold"
                     :class="p.place===1 ? 'h-16 w-16 text-2xl' : 'h-12 w-12 text-lg'">{{ initials(p.row.name) }}</div>
                <Icon name="trophy" :size="p.place===1 ? 20 : 16"
                      class="absolute -top-2 -right-1" :class="medalColor[p.place]" />
              </div>
              <div class="mt-1 max-w-full truncate text-xs font-semibold">{{ p.row.name }}</div>
              <div class="stat-num text-brand" :class="p.place===1 ? 'text-2xl' : 'text-lg'">{{ formatPts(p.row.total) }}</div>
              <div class="flex w-full items-center justify-center rounded-t-lg bg-white/[0.06] font-display font-bold text-muted"
                   :class="p.place===1 ? 'h-16 text-3xl' : (p.place===2 ? 'h-12 text-xl' : 'h-8 text-lg')"
                   :style="{ boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.06)' }">{{ p.place }}</div>
            </template>
          </div>
        </div>
      </div>

      <!-- Full table -->
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wide text-muted">
              <th class="py-2.5 pl-4">#</th><th class="py-2.5">Player</th>
              <th class="py-2.5 px-1 text-center">Grp</th><th class="py-2.5 px-1 text-center">KO</th>
              <th class="py-2.5 px-1 text-center" :class="{ 'opacity-50': !countAdv }">Adv{{ countAdv ? '' : '*' }}</th><th class="py-2.5 px-1 text-center">Cha</th>
              <th class="py-2.5 pr-4 text-center">Tot</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="r.userId" class="border-t border-white/5 cursor-pointer hover:bg-white/5"
                :class="{ 'bg-brand/10': r.userId === me }" @click="openPlayer(r.userId)">
              <td class="py-2.5 pl-4 stat-num text-muted">{{ i + 1 }}</td>
              <td class="py-2.5 font-medium truncate max-w-[9rem]">
                {{ r.name }}<span v-if="r.userId === me" class="ml-1 chip-done">you</span>
              </td>
              <td class="py-2.5 px-1 text-center stat-num text-muted">{{ r.group }}</td>
              <td class="py-2.5 px-1 text-center stat-num text-muted">{{ formatPts(r.knockout) }}</td>
              <td class="py-2.5 px-1 text-center stat-num text-muted" :class="{ 'opacity-50 italic': !countAdv }">{{ r.advances }}</td>
              <td class="py-2.5 px-1 text-center stat-num text-muted">{{ r.champion }}</td>
              <td class="py-2.5 pr-4 text-center stat-num text-lg font-bold text-brand">{{ formatPts(r.total) }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7" class="py-6 text-center text-muted">No members yet.</td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-muted">Grp = group results · KO = knockout results · Adv = advancers/thirds/reach · Cha = champion.</p>
      <p v-if="!countAdv" class="text-[11px] text-accent">* Advance points are shown but not added to the total yet — the admin enables this after the tournament.</p>
    </template>
  </div>
</template>
