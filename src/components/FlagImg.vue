<script setup>
import { ref } from 'vue'
import { flagUrl, flagEmoji } from '../lib/teams.js'

const props = defineProps({
  code: { type: String, default: '' },
  size: { type: String, default: 'w-6' } // tailwind width class
})
const failed = ref(false)
</script>

<template>
  <span :class="['inline-block align-middle overflow-hidden rounded-[3px]', size]" style="aspect-ratio: 4 / 3;">
    <img
      v-if="code && !failed"
      :src="flagUrl(code)"
      :alt="code"
      class="w-full h-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <span v-else class="leading-none">{{ flagEmoji(code) }}</span>
  </span>
</template>
