<script setup>
import { computed } from 'vue'
import FlagImg from './FlagImg.vue'
import { useMatchesStore } from '../stores/matches.js'

const props = defineProps({ group: { type: String, required: true } })
const ms = useMatchesStore()

const rows = computed(() => ms.standings.groups[props.group] || [])
const qualifiedThirds = computed(() => ms.standings.qualifiedThirdIds)
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex items-center justify-between bg-brand/5 px-3 py-2">
      <h3 class="font-bold">Group {{ group }}</h3>
      <span class="text-[11px] text-muted">MP W D L · GF GA GD · Pts</span>
    </div>
    <table class="w-full text-sm">
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.teamId"
          class="border-t border-white/10"
          :class="{
            'qualify': r.position <= 2,
            'qualify-third': r.position === 3 && qualifiedThirds.has(r.teamId)
          }"
        >
          <td class="py-1.5 pl-3 pr-1 text-muted tabular-nums w-5">{{ r.position }}</td>
          <td class="py-1.5 pr-2">
            <div class="flex items-center gap-2 min-w-0">
              <FlagImg :code="r.team.flag_code" size="w-5" />
              <span class="truncate font-medium">{{ r.team.name }}</span>
              <span v-if="r.position === 3 && qualifiedThirds.has(r.teamId)" class="chip-live ml-1">3rd ✓</span>
            </div>
          </td>
          <td class="py-1.5 px-1 text-center tabular-nums text-muted">{{ r.mp }}</td>
          <td class="py-1.5 px-1 text-center tabular-nums text-muted hidden xs:table-cell">{{ r.w }}</td>
          <td class="py-1.5 px-1 text-center tabular-nums text-muted hidden xs:table-cell">{{ r.d }}</td>
          <td class="py-1.5 px-1 text-center tabular-nums text-muted hidden xs:table-cell">{{ r.l }}</td>
          <td class="py-1.5 px-1 text-center tabular-nums text-muted">{{ r.gd > 0 ? '+' : '' }}{{ r.gd }}</td>
          <td class="py-1.5 pr-3 pl-1 text-center font-bold tabular-nums">{{ r.pts }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
