<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMatchesStore } from '../stores/matches.js'
import { usePredictionsStore } from '../stores/predictions.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { useAuthStore } from '../stores/auth.js'
import FlagImg from '../components/FlagImg.vue'
import { formatKickoff } from '../lib/time.js'
import { ADVANCE_PTS, CHAMPION_PTS, THIRD_QUALIFY_PTS, KO_REACH_PTS } from '../lib/scoring.js'
import { routeThirds, THIRD_SLOT_MATCHES } from '../lib/annexC.js'

const ms = useMatchesStore()
const ps = usePredictionsStore()
const lg = useLeaguesStore()
const auth = useAuthStore()
const { isAdmin } = storeToRefs(auth)

const locked = computed(() => ms.pretournamentLocked)
const KO_LABEL = { r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final' }
const KO_STAGES = ['r32', 'r16', 'qf', 'sf', 'final']

const orders = ref({})
const champion = ref(null)
const selectedThirds = ref(new Set()) // group letters whose 3rd advances
const status = ref('idle')
const toast = ref('')
let statusTimer, toastTimer
const groupTimers = {}

function initLocal() {
  const o = {}
  for (const g of ms.groupLetters) {
    const saved = ps.myGroupOrder[g]
    const teams = (ms.teamsByGroup[g] || []).map((t) => t.id)
    o[g] = saved && saved.filter(Boolean).length === 4 ? saved.slice() : teams
  }
  orders.value = o
  champion.value = ps.myChampion
  // Reconstruct the selected thirds from any saved third-slot assignments.
  const s = new Set()
  for (const tid of Object.values(ps.myThirdSlots)) {
    const t = ms.teamById[tid]; if (t) s.add(t.group_letter)
  }
  selectedThirds.value = s
}
watch([() => ps.loaded, () => ms.loaded], initLocal, { immediate: true })

const team = (id) => ms.teamById[id]
const allTeams = computed(() => ms.teams.slice().sort((a, b) => a.name.localeCompare(b.name)))
const advOf = (mId) => ps.myBracketByMatch[mId]
const isThirdSlot = (m) => /^3/.test(m.away_placeholder || '')

function flashSaved() {
  status.value = 'saved'; clearTimeout(statusTimer)
  statusTimer = setTimeout(() => (status.value = 'idle'), 1500)
}
function showToast(msg) {
  toast.value = msg; clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3500)
}
async function withStatus(fn) {
  status.value = 'saving'
  try { await fn(); flashSaved() } catch (e) { showToast(e.message); status.value = 'idle' }
}

// ----- bracket resolution -----
function buildResolved() {
  const res = {}
  const orderOf = orders.value
  const thirds = ps.myThirdSlots
  const adv = ps.myBracketByMatch
  const fromPlaceholder = (ph, matchId) => {
    if (!ph) return null
    let m
    if ((m = ph.match(/^([12])([A-L])$/))) return orderOf[m[2]]?.[+m[1] - 1] ?? null
    if (/^3/.test(ph)) return thirds[matchId] ?? null
    if ((m = ph.match(/^W(\d+)$/))) return adv[+m[1]] ?? null
    if ((m = ph.match(/^L(\d+)$/))) {
      const w = adv[+m[1]]; const r = res[+m[1]]
      if (!w || !r) return null
      return r.home === w ? r.away : r.home
    }
    return null
  }
  for (const stage of [...KO_STAGES, 'third_place']) {
    for (const mt of ms.matchesByStage[stage] || []) {
      res[mt.id] = {
        home: fromPlaceholder(mt.home_placeholder, mt.id),
        away: fromPlaceholder(mt.away_placeholder, mt.id)
      }
    }
  }
  return res
}
const resolved = computed(() => buildResolved())

// The 12 candidate thirds (3rd-placed team of each group, per current order).
const candidateThirds = computed(() =>
  ms.groupLetters.map((g) => ({ group: g, teamId: orders.value[g]?.[2] })).filter((c) => c.teamId)
)

// ----- third-place selection → Annexe C auto-routing -----
async function applyThirdRouting() {
  const groups = [...selectedThirds.value]
  if (groups.length !== 8) {
    // Need exactly 8 to route — clear any slot assignments until then.
    for (const slot of THIRD_SLOT_MATCHES) {
      if (ps.myThirdSlots[slot] != null) await ps.saveThirdSlot(lg.currentLeagueId, slot, null)
    }
    await reconcile()
    return
  }
  const route = routeThirds(groups) // { matchId: sourceGroup }
  for (const [slot, srcGroup] of Object.entries(route)) {
    const tid = orders.value[srcGroup]?.[2]
    if (tid != null) await ps.saveThirdSlot(lg.currentLeagueId, +slot, tid)
  }
  await reconcile()
}

function toggleThird(g) {
  if (locked.value) return
  const s = new Set(selectedThirds.value)
  if (s.has(g)) s.delete(g)
  else { if (s.size >= 8) { showToast('Pick exactly 8 thirds — deselect one first'); return } s.add(g) }
  selectedThirds.value = s
  withStatus(applyThirdRouting)
}

// ----- cascade: clear picks invalidated by an upstream change -----
async function reconcile() {
  if (locked.value) return
  let cleared = 0
  let changed = true
  while (changed) {
    changed = false
    const res = buildResolved()
    for (const b of ps.bracketPicks.filter((x) => x.user_id === ps.myUserId)) {
      const r = res[b.match_id]
      const ok = r && (b.advancing_team_id === r.home || b.advancing_team_id === r.away)
      if (!ok) { await ps.saveBracketPick(lg.currentLeagueId, b.match_id, null); cleared++; changed = true }
    }
  }
  if (cleared) showToast(`${cleared} later pick${cleared > 1 ? 's' : ''} cleared`)
}

// ----- group order / champion / winners -----
function move(g, idx, dir) {
  if (locked.value) return
  const arr = orders.value[g]
  const j = idx + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
  scheduleGroupSave(g)
}
function scheduleGroupSave(g) {
  status.value = 'saving'
  clearTimeout(groupTimers[g])
  groupTimers[g] = setTimeout(() => {
    withStatus(async () => {
      await ps.saveGroupPositions(lg.currentLeagueId, g, orders.value[g])
      await applyThirdRouting() // 3rd-placed teams may have changed → re-route
    })
  }, 700)
}
function onChampion(e) {
  champion.value = e.target.value ? Number(e.target.value) : null
  if (champion.value) withStatus(() => ps.saveChampion(lg.currentLeagueId, champion.value))
}
function pickWinner(match, teamId) {
  if (locked.value || !teamId) return
  withStatus(async () => {
    await ps.saveBracketPick(lg.currentLeagueId, match.id, teamId)
    await reconcile()
  })
}
async function toggleLock() {
  try { await ms.setPretournamentLock(!locked.value) } catch (e) { showToast(e.message) }
}
</script>

<template>
  <div class="space-y-4">
    <div class="card p-3">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h2 class="font-display text-2xl font-bold">Pre-tournament bracket</h2>
          <p class="text-sm text-muted">
            Top 2 per group <strong>+{{ ADVANCE_PTS }}</strong> each · each correct best-third <strong>+{{ THIRD_QUALIFY_PTS }}</strong> ·
            reach R16/QF/SF/Final <strong>+{{ KO_REACH_PTS.r16 }}/{{ KO_REACH_PTS.qf }}/{{ KO_REACH_PTS.sf }}/{{ KO_REACH_PTS.final }}</strong> ·
            champion <strong>+{{ CHAMPION_PTS }}</strong>.
          </p>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="chip" :class="locked ? 'chip-lock' : 'chip-done'">{{ locked ? 'Locked' : 'Open' }}</span>
          <span v-if="status==='saving'" class="text-[11px] text-muted">Saving…</span>
          <span v-else-if="status==='saved'" class="text-[11px] text-brand">Saved ✓</span>
        </div>
      </div>
      <button v-if="isAdmin" class="btn-ghost btn-sm mt-2" @click="toggleLock">
        {{ locked ? 'Unlock bracket (admin)' : 'Lock bracket (admin)' }}
      </button>
      <p v-if="!lg.currentLeagueId" class="mt-1 text-xs text-red-500">Join or create a league first.</p>
      <p class="mt-1 text-[11px] text-muted">Auto-saves. Third-place matchups follow FIFA's official Annexe C routing.</p>
    </div>

    <!-- Champion -->
    <div class="card p-3 space-y-2">
      <span class="label">Champion (+{{ CHAMPION_PTS }})</span>
      <div class="flex items-center gap-2">
        <FlagImg v-if="champion" :code="team(champion)?.flag_code" />
        <select class="input" :value="champion" :disabled="locked" @change="onChampion">
          <option :value="''" disabled>Pick a team…</option>
          <option v-for="t in allTeams" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
    </div>

    <!-- Group orderings -->
    <details class="card p-3" open>
      <summary class="cursor-pointer font-bold">Group finishing order</summary>
      <div class="mt-2 grid gap-3 sm:grid-cols-2">
        <div v-for="g in ms.groupLetters" :key="g" class="rounded-xl border border-white/10 p-2">
          <h3 class="font-semibold">Group {{ g }}</h3>
          <ol class="mt-1 space-y-1">
            <li v-for="(tid, idx) in orders[g]" :key="tid"
                class="flex items-center gap-2 rounded-lg px-2 py-1"
                :class="idx < 2 ? 'qualify' : (idx === 2 ? 'qualify-third' : 'bg-surface')">
              <span class="w-4 text-center text-xs font-bold text-muted">{{ idx + 1 }}</span>
              <FlagImg :code="team(tid)?.flag_code" size="w-5" />
              <span class="truncate text-sm font-medium">{{ team(tid)?.name }}</span>
              <div v-if="!locked" class="ml-auto flex gap-1">
                <button class="btn-ghost btn-sm !px-2 !py-0.5" :disabled="idx===0" @click="move(g, idx, -1)">▲</button>
                <button class="btn-ghost btn-sm !px-2 !py-0.5" :disabled="idx===3" @click="move(g, idx, 1)">▼</button>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </details>

    <!-- Best 8 thirds -->
    <div class="card p-3">
      <div class="flex items-center justify-between">
        <h3 class="font-bold">Best 8 third-placed teams</h3>
        <span class="chip" :class="selectedThirds.size === 8 ? 'chip-done' : 'chip-live'">{{ selectedThirds.size }}/8</span>
      </div>
      <p class="text-xs text-muted">Pick which 8 of the 12 third-placed teams advance. FIFA's Annexe C then assigns their Round-of-32 matchups automatically.</p>
      <div class="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
        <button v-for="c in candidateThirds" :key="c.group"
          class="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-left text-sm"
          :class="selectedThirds.has(c.group) ? 'qualify font-semibold' : 'bg-surface'"
          :disabled="locked"
          @click="toggleThird(c.group)">
          <span class="w-3 text-center">{{ selectedThirds.has(c.group) ? '✓' : '' }}</span>
          <FlagImg :code="team(c.teamId)?.flag_code" size="w-5" />
          <span class="truncate">{{ team(c.teamId)?.name }}</span>
          <span class="ml-auto text-[11px] text-muted">3{{ c.group }}</span>
        </button>
      </div>
    </div>

    <!-- Connected knockout bracket -->
    <div class="card p-3">
      <h3 class="font-bold">Knockout bracket</h3>
      <p class="text-xs text-muted">Tap a team to advance them. Round-of-32 third-place opponents are filled by Annexe C once you've chosen 8 thirds.</p>

      <div v-for="stage in KO_STAGES" :key="stage" class="mt-3">
        <div class="label mb-1">{{ KO_LABEL[stage] }}</div>
        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="m in ms.matchesByStage[stage]" :key="m.id" class="rounded-xl border border-white/10 p-2">
            <div class="text-[10px] text-muted">#{{ m.match_no }} · {{ formatKickoff(m.kickoff_utc) }}</div>

            <button
              class="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
              :class="advOf(m.id) && advOf(m.id) === resolved[m.id]?.home ? 'qualify font-semibold' : 'hover:bg-white/5'"
              :disabled="locked || !resolved[m.id]?.home"
              @click="pickWinner(m, resolved[m.id]?.home)"
            >
              <FlagImg :code="team(resolved[m.id]?.home)?.flag_code" size="w-5" />
              <span class="truncate text-sm">{{ team(resolved[m.id]?.home)?.name || m.home_placeholder }}</span>
            </button>

            <button
              class="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left"
              :class="advOf(m.id) && advOf(m.id) === resolved[m.id]?.away ? 'qualify font-semibold' : 'hover:bg-white/5'"
              :disabled="locked || !resolved[m.id]?.away"
              @click="pickWinner(m, resolved[m.id]?.away)"
            >
              <FlagImg :code="team(resolved[m.id]?.away)?.flag_code" size="w-5" />
              <span class="truncate text-sm">
                {{ team(resolved[m.id]?.away)?.name || (isThirdSlot(m) ? m.away_placeholder + ' — pick 8 thirds above' : m.away_placeholder) }}
              </span>
            </button>
          </div>
        </div>
      </div>
      <p class="mt-2 text-[11px] text-muted">Champion (+{{ CHAMPION_PTS }}) is picked separately above.</p>
    </div>

    <div v-if="toast" class="fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
      <div class="popover px-4 py-2.5 text-sm">{{ toast }}</div>
    </div>
  </div>
</template>
