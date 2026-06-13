<script setup>
import { computed } from 'vue'
import { useMatchesStore } from '../stores/matches.js'
import GroupTable from '../components/GroupTable.vue'

const ms = useMatchesStore()
const groups = computed(() => ms.groupLetters)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-2xl font-bold">Group standings</h2>
      <span class="text-xs text-muted">Top 2 + best 8 thirds advance</span>
    </div>

    <div v-if="!ms.loaded" class="text-muted">Loading…</div>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <GroupTable v-for="g in groups" :key="g" :group="g" />
    </div>

    <div class="flex flex-wrap gap-3 text-xs text-muted">
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded qualify"></span> Top 2 (advance)</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded qualify-third"></span> 3rd place — qualified</span>
    </div>
  </div>
</template>
