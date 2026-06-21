<script setup>
import { computed, ref } from 'vue'
import { useMatchesStore } from '../stores/matches.js'
import GroupTable from '../components/GroupTable.vue'

const ms = useMatchesStore()
const groups = computed(() => ms.groupLetters)
const expanded = ref(false) // compact by default; toggle reveals full stats
const VIEWS = [{ k: false, l: 'Compact' }, { k: true, l: 'Expanded' }]
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-display text-2xl font-bold">Group standings</h2>
      <div class="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
        <button v-for="v in VIEWS" :key="String(v.k)"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-200"
          :class="expanded === v.k ? 'bg-brand text-brand-ink' : 'text-muted'" @click="expanded = v.k">{{ v.l }}</button>
      </div>
    </div>
    <p class="text-xs text-muted">Top 2 + best 8 thirds advance</p>

    <div v-if="!ms.loaded" class="text-muted">Loading…</div>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <GroupTable v-for="g in groups" :key="g" :group="g" :expanded="expanded" />
    </div>

    <div class="flex flex-wrap gap-3 text-xs text-muted">
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded qualify"></span> Top 2 (advance)</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded qualify-third"></span> 3rd place — qualified</span>
    </div>
  </div>
</template>
