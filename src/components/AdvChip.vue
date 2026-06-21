<script setup>
import { computed } from 'vue'
import { formatPts } from '../lib/scoring.js'
// Final states: 'earned' | 'missed'. Provisional (live, not yet decided):
// 'likely' (currently on track) | 'pending' (currently off track / no data).
const props = defineProps({
  pts: { type: Number, required: true },
  state: { type: String, default: 'pending' } // earned | missed | likely | pending
})
// Provisional states carry a '*' to signal they can still change.
const provisional = computed(() => props.state === 'likely' || props.state === 'pending')
</script>

<template>
  <span
    class="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
    :class="{
      'bg-brand/20 text-brand': state === 'earned',
      'bg-white/5 text-muted opacity-40 line-through': state === 'missed',
      'border border-brand/40 text-brand/70': state === 'likely',
      'bg-white/5 text-muted opacity-40': state === 'pending'
    }"
  >+{{ formatPts(pts) }}<span v-if="provisional">*</span></span>
</template>
