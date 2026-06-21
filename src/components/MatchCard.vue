<script setup>
import { ref, computed, watch } from 'vue'
import FlagImg from './FlagImg.vue'
import Icon from './Icon.vue'
import { useMatchesStore } from '../stores/matches.js'
import { usePredictionsStore } from '../stores/predictions.js'
import { useLeaguesStore } from '../stores/leagues.js'
import { formatKickoff } from '../lib/time.js'
import { matchFinished, formatPts } from '../lib/scoring.js'

const props = defineProps({ match: { type: Object, required: true } })

const ms = useMatchesStore()
const ps = usePredictionsStore()
const lg = useLeaguesStore()

const home = computed(() => ms.teamById[props.match.home_team_id])
const away = computed(() => ms.teamById[props.match.away_team_id])
const homeLabel = computed(() => home.value?.name || props.match.home_placeholder || 'TBD')
const awayLabel = computed(() => away.value?.name || props.match.away_placeholder || 'TBD')
const locked = computed(() => ms.isLocked(props.match))
const finished = computed(() => matchFinished(props.match))
const canPredict = computed(() => home.value && away.value && !locked.value && lg.currentLeagueId)

const myPred = computed(() => ps.myPredByMatch[props.match.id])
const ph = ref('')
const pa = ref('')
const adv = ref(null) // who the player thinks advances on pens/ET (drawn KO only)
const predMsg = ref('')
const saving = ref(false)
watch(myPred, (p) => {
  ph.value = p?.home_pred ?? ''
  pa.value = p?.away_pred ?? ''
  adv.value = p?.advancing_team_id ?? null
}, { immediate: true })

// A KO match the player has predicted to finish level needs an advancer pick
// (includes the third-place play-off — it's decided on pens/ET too).
const isKo = computed(() => props.match.stage !== 'group')
const predictedDraw = computed(() => ph.value !== '' && pa.value !== '' && Number(ph.value) === Number(pa.value))
const needsAdvancer = computed(() => isKo.value && predictedDraw.value)

async function savePred() {
  predMsg.value = ''
  if (needsAdvancer.value && !adv.value) { predMsg.value = 'Pick who advances'; return }
  saving.value = true
  try {
    await ps.savePrediction(lg.currentLeagueId, props.match.id, Number(ph.value), Number(pa.value),
      needsAdvancer.value ? adv.value : null)
    predMsg.value = 'saved'
  } catch (e) { predMsg.value = e.message } finally { saving.value = false }
}
const score = computed(() => (myPred.value ? ps.myMatchScore(props.match.id) : null))
</script>

<template>
  <div class="card p-3">
    <div class="flex items-center justify-between text-[11px] text-muted">
      <span>{{ formatKickoff(match.kickoff_utc) }}</span>
      <span v-if="finished" class="chip-done"><Icon name="check" :size="11" /> final</span>
      <span v-else-if="locked" class="chip-lock"><Icon name="lock" :size="11" /> locked</span>
    </div>
    <div class="mt-0.5 text-[10px] text-muted">{{ match.venue }} · #{{ match.match_no }}</div>

    <!-- Teams + scores -->
    <div class="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <FlagImg :code="home?.flag_code" />
        <span class="truncate font-semibold">{{ homeLabel }}</span>
      </div>
      <div class="text-center font-display text-2xl font-bold tabular-nums leading-none">
        <span v-if="finished" class="text-brand">{{ match.home_score }}<span class="text-muted">–</span>{{ match.away_score }}</span>
        <span v-else class="text-xs text-muted">vs</span>
      </div>
      <div class="flex items-center justify-end gap-2 min-w-0">
        <span class="truncate text-right font-semibold">{{ awayLabel }}</span>
        <FlagImg :code="away?.flag_code" />
      </div>
    </div>

    <!-- Prediction -->
    <div class="mt-3 border-t border-white/5 pt-3">
      <div class="flex items-center justify-between">
        <span class="label">Your prediction</span>
        <span v-if="score && score.total" class="chip-done">+{{ formatPts(score.total) }} pts</span>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <input class="score-input" type="number" min="0" v-model="ph" :disabled="!canPredict" aria-label="home prediction" />
        <span class="text-muted">–</span>
        <input class="score-input" type="number" min="0" v-model="pa" :disabled="!canPredict" aria-label="away prediction" />
        <button v-if="canPredict" class="btn-brand btn-sm ml-auto" :disabled="saving || ph==='' || pa===''" @click="savePred">
          {{ saving ? '…' : 'Save' }}
        </button>
        <span v-else-if="!home || !away" class="ml-auto text-xs text-muted">Teams TBD</span>
        <span v-else-if="!lg.currentLeagueId" class="ml-auto text-xs text-muted">Join a league</span>
        <span v-else class="ml-auto text-xs text-muted">Locked</span>
      </div>

      <!-- Drawn KO prediction: who advances on pens/ET -->
      <div v-if="needsAdvancer" class="mt-2">
        <div class="label mb-1">Advances (pens/ET)</div>
        <div class="flex gap-1.5">
          <button class="btn-ghost btn-sm flex-1" :class="{ '!bg-brand !text-brand-ink': adv === match.home_team_id }"
            :disabled="!canPredict" @click="adv = match.home_team_id">
            <FlagImg :code="home?.flag_code" size="w-4" /> {{ homeLabel }}
          </button>
          <button class="btn-ghost btn-sm flex-1" :class="{ '!bg-brand !text-brand-ink': adv === match.away_team_id }"
            :disabled="!canPredict" @click="adv = match.away_team_id">
            <FlagImg :code="away?.flag_code" size="w-4" /> {{ awayLabel }}
          </button>
        </div>
      </div>
      <p v-if="predMsg" class="mt-1 text-xs" :class="predMsg==='saved' ? 'text-brand' : 'text-red-300'">{{ predMsg }}</p>
      <div v-if="score && (score.exact || score.closest)" class="mt-1 text-[11px] text-muted">
        <span v-if="score.base">result ✓ </span>
        <span v-if="score.exact">· exact +{{ score.exact }}</span>
        <span v-if="score.closest">· closest +{{ score.closest }}</span>
      </div>
    </div>
  </div>
</template>
