<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FlagImg from './FlagImg.vue'
import { useMatchesStore } from '../stores/matches.js'
import { usePredictionsStore } from '../stores/predictions.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { useAuthStore } from '../stores/auth.js'
import { formatKickoff } from '../lib/time.js'
import { matchFinished } from '../lib/scoring.js'

const props = defineProps({ match: { type: Object, required: true } })

const ms = useMatchesStore()
const ps = usePredictionsStore()
const lg = useLeaguesStore()
const auth = useAuthStore()
const { isAdmin } = storeToRefs(auth)

const home = computed(() => ms.teamById[props.match.home_team_id])
const away = computed(() => ms.teamById[props.match.away_team_id])
const homeLabel = computed(() => home.value?.name || props.match.home_placeholder || 'TBD')
const awayLabel = computed(() => away.value?.name || props.match.away_placeholder || 'TBD')
const locked = computed(() => ms.isLocked(props.match))
const finished = computed(() => matchFinished(props.match))
const canPredict = computed(() => home.value && away.value && !locked.value)

// ---- Player prediction ----
const myPred = computed(() => ps.myPredByMatch[props.match.id])
const ph = ref('')
const pa = ref('')
const predMsg = ref('')
const saving = ref(false)
watch(myPred, (p) => { ph.value = p?.home_pred ?? ''; pa.value = p?.away_pred ?? '' }, { immediate: true })

async function savePred() {
  predMsg.value = ''
  saving.value = true
  try {
    await ps.savePrediction(lg.currentLeagueId, props.match.id, Number(ph.value), Number(pa.value))
    predMsg.value = 'Saved'
  } catch (e) {
    predMsg.value = e.message
  } finally {
    saving.value = false
  }
}

const score = computed(() => (myPred.value ? ps.myMatchScore(props.match.id) : null))

// ---- Admin result ----
const rh = ref(props.match.home_score ?? '')
const ra = ref(props.match.away_score ?? '')
const adminMsg = ref('')
async function saveResult() {
  adminMsg.value = ''
  try {
    await ms.saveResult(props.match.id, Number(rh.value), Number(ra.value))
    adminMsg.value = 'Result saved'
  } catch (e) { adminMsg.value = e.message }
}
async function toggleLock() {
  try { await ms.setMatchLock(props.match.id, !props.match.manual_lock) }
  catch (e) { adminMsg.value = e.message }
}
const showAdmin = ref(false)
</script>

<template>
  <div class="card p-3">
    <div class="flex items-center justify-between text-xs text-muted">
      <span>{{ formatKickoff(match.kickoff_utc) }}</span>
      <span v-if="match.is_third_place_playoff" class="chip">Non-scoring</span>
      <span v-else-if="finished" class="chip-done">Final</span>
      <span v-else-if="locked" class="chip-lock">🔒 Locked</span>
    </div>
    <div class="mt-1 text-[11px] text-muted">{{ match.venue }} · #{{ match.match_no }}</div>

    <!-- Teams + scores -->
    <div class="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <FlagImg :code="home?.flag_code" />
        <span class="truncate font-semibold">{{ homeLabel }}</span>
      </div>
      <div class="text-center font-bold tabular-nums">
        <span v-if="finished">{{ match.home_score }}–{{ match.away_score }}</span>
        <span v-else class="text-muted">vs</span>
      </div>
      <div class="flex items-center justify-end gap-2 min-w-0">
        <span class="truncate font-semibold text-right">{{ awayLabel }}</span>
        <FlagImg :code="away?.flag_code" />
      </div>
    </div>

    <!-- Player prediction -->
    <div v-if="!match.is_third_place_playoff" class="mt-3 border-t border-line pt-3">
      <div class="flex items-center justify-between gap-2">
        <span class="label">Your prediction</span>
        <span v-if="score && score.total" class="chip-done">+{{ score.total }} pts</span>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <input class="score-input" type="number" min="0" v-model="ph" :disabled="!canPredict" />
        <span class="text-muted">–</span>
        <input class="score-input" type="number" min="0" v-model="pa" :disabled="!canPredict" />
        <button v-if="canPredict" class="btn-brand btn-sm ml-auto" :disabled="saving || ph===''||pa===''" @click="savePred">
          {{ saving ? '…' : 'Save' }}
        </button>
        <span v-else-if="!home || !away" class="ml-auto text-xs text-muted">Teams TBD</span>
        <span v-else class="ml-auto text-xs text-muted">Locked</span>
      </div>
      <p v-if="predMsg" class="mt-1 text-xs" :class="predMsg==='Saved' ? 'text-brand' : 'text-red-500'">{{ predMsg }}</p>
      <div v-if="score && (score.exact || score.closest)" class="mt-1 text-[11px] text-muted">
        <span v-if="score.base">result ✓ </span>
        <span v-if="score.exact">· exact +{{ score.exact }}</span>
        <span v-if="score.closest">· closest +{{ score.closest }}</span>
      </div>
    </div>

    <!-- Admin controls -->
    <div v-if="isAdmin" class="mt-3 border-t border-dashed border-line pt-2">
      <button class="text-xs font-semibold text-accent" @click="showAdmin = !showAdmin">
        {{ showAdmin ? '▾ Hide admin' : '▸ Admin' }}
      </button>
      <div v-if="showAdmin" class="mt-2 space-y-2">
        <div class="flex items-center gap-2">
          <span class="label">Actual</span>
          <input class="score-input" type="number" min="0" v-model="rh" />
          <span>–</span>
          <input class="score-input" type="number" min="0" v-model="ra" />
          <button class="btn-ghost btn-sm" @click="saveResult">Save result</button>
        </div>
        <button class="btn-ghost btn-sm" @click="toggleLock">
          {{ match.manual_lock ? 'Unlock' : 'Lock' }} match
        </button>
        <p v-if="adminMsg" class="text-xs text-brand">{{ adminMsg }}</p>
      </div>
    </div>
  </div>
</template>
