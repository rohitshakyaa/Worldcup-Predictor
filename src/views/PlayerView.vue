<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useMatchesStore } from '../stores/matches.js'
import { usePredictionsStore } from '../stores/predictions.js'
import { useAuthStore } from '../stores/auth.js'
import FlagImg from '../components/FlagImg.vue'
import AdvChip from '../components/AdvChip.vue'
import { formatDate } from '../lib/time.js'
import { matchFinished, formatPts, ADVANCE_PTS, THIRD_QUALIFY_PTS, KO_REACH_PTS, THIRD_PLACE_WIN_PTS, CHAMPION_PTS } from '../lib/scoring.js'

const KO_STAGES = ['r32', 'r16', 'qf', 'sf', 'final']
const KO_LABEL = { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' }
const REACH_ROUND = { r32: 'r16', r16: 'qf', qf: 'sf', sf: 'final' }

const route = useRoute()
const router = useRouter()
const ms = useMatchesStore()
const ps = usePredictionsStore()
const { user } = storeToRefs(useAuthStore())

const userId = computed(() => route.params.userId)

// Your own entry is editable elsewhere — send yourself to /picks.
watch([userId, user], () => {
  if (userId.value && user.value?.id === userId.value) router.replace('/picks')
}, { immediate: true })

const team = (id) => ms.teamById[id]

const lbRow = computed(() => ps.leaderboard.find((r) => r.userId === userId.value))
const name = computed(() => lbRow.value?.name || 'Player')
const totals = computed(() => lbRow.value || { group: 0, knockout: 0, advances: 0, champion: 0, total: 0 })

// Match predictions — only matches that have locked (kickoff passed / manual),
// latest kickoff first.
const lockedRows = computed(() => {
  const preds = ps.predByMatchFor(userId.value)
  const out = []
  for (const m of ms.matches) {
    const p = preds[m.id]
    if (!p || !ms.isLocked(m)) continue
    out.push({ m, p, score: ps.matchScoreFor(userId.value, m.id) })
  }
  return out.sort((a, b) => new Date(b.m.kickoff_utc) - new Date(a.m.kickoff_utc))
})

// Bracket inputs — visible only once predictions have closed for everyone.
const bracketVisible = computed(() => ms.pretournamentLocked)
const championId = computed(() => ps.championFor(userId.value))
const groupOrder = computed(() => ps.groupOrderFor(userId.value))
const thirdTeamIds = computed(() => {
  const ids = Object.values(ps.thirdSlotsFor(userId.value)).filter((x) => x != null)
  return ids.sort((a, b) => (team(a)?.name || '').localeCompare(team(b)?.name || ''))
})

// ----- this player's connected knockout bracket (read-only) -----
const resolved = computed(() => {
  const orderOf = groupOrder.value
  const thirds = ps.thirdSlotsFor(userId.value)
  const adv = ps.bracketByMatchFor(userId.value)
  const res = {}
  const fromPlaceholder = (ph, matchId) => {
    if (!ph) return null
    let m
    if ((m = /^([12])([A-L])$/.exec(ph))) return orderOf[m[2]]?.[+m[1] - 1] ?? null
    if (/^3/.test(ph)) return thirds[matchId] ?? null
    if ((m = /^W(\d+)$/.exec(ph))) return adv[+m[1]] ?? null
    if ((m = /^L(\d+)$/.exec(ph))) {
      const w = adv[+m[1]]; const r = res[+m[1]]
      if (!w || !r) return null
      return r.home === w ? r.away : r.home
    }
    return null
  }
  for (const stage of [...KO_STAGES, 'third_place']) {
    for (const mt of ms.matchesByStage[stage] || []) {
      res[mt.id] = { home: fromPlaceholder(mt.home_placeholder, mt.id), away: fromPlaceholder(mt.away_placeholder, mt.id) }
    }
  }
  return res
})
const advOf = (mId) => ps.bracketByMatchFor(userId.value)[mId]
const reachRound = (m) => REACH_ROUND[m.stage]

// ----- advance-point states -----
// Table-driven picks track the LIVE standings: likely (on track) / pending
// (off track) while undecided, then earned / missed once final.
function top2State(g, tid) {
  const onTrack = ms.advancers[g]?.has(tid)
  if (!ms.groupComplete(g)) return onTrack ? 'likely' : 'pending'
  return onTrack ? 'earned' : 'missed'
}
function thirdState(tid) {
  if (!ms.allGroupsComplete) return ms.standings.qualifiedThirdIds.has(tid) ? 'likely' : 'pending'
  const q = ps.actualQualifiedThirdIds // override-aware final set
  return q && q.has(tid) ? 'earned' : 'missed'
}
function reachState(m) {
  const picked = advOf(m.id)
  if (!picked || !matchFinished(m)) return 'pending'
  return ps.actualReachByRound[reachRound(m)]?.has(picked) ? 'earned' : 'missed'
}
function championState() {
  const actual = ps.actualChampionId
  if (actual == null) return 'pending'
  return championId.value === actual ? 'earned' : 'missed'
}
function thirdPlaceState(m) {
  const picked = advOf(m.id)
  const actual = ps.actualThirdPlaceId
  if (!picked || actual == null) return 'pending'
  return picked === actual ? 'earned' : 'missed'
}
</script>

<template>
  <div class="space-y-4">
    <button class="btn-ghost btn-sm" @click="router.back()">← Back</button>

    <div class="card p-3">
      <h2 class="font-display text-2xl font-bold truncate">{{ name }}</h2>
      <div class="mt-2 grid grid-cols-4 gap-2 text-center">
        <div><div class="text-xl font-bold">{{ totals.group }}</div><div class="label">Group</div></div>
        <div><div class="text-xl font-bold">{{ formatPts(totals.knockout) }}</div><div class="label">Knockout</div></div>
        <div><div class="text-xl font-bold">{{ totals.advances }}</div><div class="label">Advances</div></div>
        <div><div class="text-xl font-bold">{{ totals.champion }}</div><div class="label">Champion</div></div>
      </div>
      <div class="mt-2 text-center text-2xl font-extrabold text-brand">{{ formatPts(totals.total) }} pts</div>
    </div>

    <!-- Match predictions (locked matches only) -->
    <div>
      <h3 class="mb-2 font-bold">Match predictions</h3>
      <div v-if="!lockedRows.length" class="card p-4 text-sm text-muted">
        No matches have locked yet — picks stay hidden until kickoff.
      </div>
      <div v-else class="space-y-2">
        <div v-for="row in lockedRows" :key="row.m.id" class="card p-2.5">
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

    <!-- Bracket (gated by the pre-tournament lock) -->
    <div>
      <h3 class="mb-2 font-bold">Bracket</h3>
      <div v-if="!bracketVisible" class="card p-4 text-sm text-muted">
        Bracket hidden until predictions close.
      </div>
      <div v-else class="space-y-3">
        <div class="card p-3">
          <div class="flex items-center justify-between">
            <span class="label">Champion</span>
            <AdvChip v-if="championId" :pts="CHAMPION_PTS" :state="championState()" />
          </div>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <template v-if="championId">
              <FlagImg :code="team(championId)?.flag_code" size="w-5" />
              <span class="font-medium">{{ team(championId)?.name }}</span>
            </template>
            <span v-else class="text-muted">No pick</span>
          </div>
        </div>

        <div class="card p-3">
          <span class="label">Group finishing order</span>
          <div class="mt-2 grid gap-3 sm:grid-cols-2">
            <div v-for="g in ms.groupLetters" :key="g" class="rounded-xl border border-white/10 p-2">
              <h4 class="font-semibold">Group {{ g }}</h4>
              <ol v-if="groupOrder[g]" class="mt-1 space-y-1">
                <li v-for="(tid, idx) in groupOrder[g]" :key="tid"
                    class="flex items-center gap-2 rounded-lg px-2 py-1"
                    :class="idx < 2 ? 'qualify' : (idx === 2 ? 'qualify-third' : 'bg-surface')">
                  <span class="w-4 text-center text-xs font-bold text-muted">{{ idx + 1 }}</span>
                  <FlagImg :code="team(tid)?.flag_code" size="w-5" />
                  <span class="truncate text-sm font-medium">{{ team(tid)?.name }}</span>
                  <AdvChip v-if="idx < 2" :pts="ADVANCE_PTS" :state="top2State(g, tid)" class="ml-auto shrink-0" />
                </li>
              </ol>
              <p v-else class="mt-1 text-xs text-muted">No pick</p>
            </div>
          </div>
        </div>

        <div class="card p-3">
          <span class="label">Best 8 third-placed teams</span>
          <div v-if="thirdTeamIds.length" class="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            <div v-for="tid in thirdTeamIds" :key="tid"
                 class="flex items-center gap-2 rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm">
              <FlagImg :code="team(tid)?.flag_code" size="w-5" />
              <span class="truncate">{{ team(tid)?.name }}</span>
              <AdvChip :pts="THIRD_QUALIFY_PTS" :state="thirdState(tid)" class="ml-auto shrink-0" />
            </div>
          </div>
          <p v-else class="mt-1 text-xs text-muted">No thirds selected.</p>
        </div>

        <!-- Connected knockout bracket (read-only) -->
        <div class="card p-3">
          <span class="label">Knockout bracket</span>
          <div v-for="stage in KO_STAGES" :key="stage" class="mt-2">
            <div class="label mb-1 opacity-70">{{ KO_LABEL[stage] }}</div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="m in ms.matchesByStage[stage]" :key="m.id" class="rounded-xl border border-white/10 p-2">
                <div class="flex items-center justify-between text-[10px] text-muted">
                  <span>#{{ m.match_no }}</span>
                  <AdvChip v-if="reachRound(m) && advOf(m.id)" :pts="KO_REACH_PTS[reachRound(m)]" :state="reachState(m)" />
                </div>
                <div v-for="side in ['home','away']" :key="side"
                     class="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5"
                     :class="advOf(m.id) && advOf(m.id) === resolved[m.id]?.[side] ? 'qualify font-semibold' : ''">
                  <FlagImg :code="team(resolved[m.id]?.[side])?.flag_code" size="w-5" />
                  <span class="truncate text-sm">{{ team(resolved[m.id]?.[side])?.name || (side === 'home' ? m.home_placeholder : m.away_placeholder) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Third-place play-off — their winner pick -->
          <div v-if="ms.matchesByStage.third_place?.length" class="mt-2">
            <div class="label mb-1 opacity-70">Third-place play-off (+{{ THIRD_PLACE_WIN_PTS }})</div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="m in ms.matchesByStage.third_place" :key="m.id" class="rounded-xl border border-white/10 p-2">
                <div class="flex items-center justify-between text-[10px] text-muted">
                  <span>#{{ m.match_no }}</span>
                  <AdvChip v-if="advOf(m.id)" :pts="THIRD_PLACE_WIN_PTS" :state="thirdPlaceState(m)" />
                </div>
                <div v-for="side in ['home','away']" :key="side"
                     class="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5"
                     :class="advOf(m.id) && advOf(m.id) === resolved[m.id]?.[side] ? 'qualify font-semibold' : ''">
                  <FlagImg :code="team(resolved[m.id]?.[side])?.flag_code" size="w-5" />
                  <span class="truncate text-sm">{{ team(resolved[m.id]?.[side])?.name || (side === 'home' ? m.home_placeholder : m.away_placeholder) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
