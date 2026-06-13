<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import Icon from './Icon.vue'
import { useAuthStore } from '../stores/auth.js'

const { isAdmin } = storeToRefs(useAuthStore())
const tabs = computed(() => {
  const base = [
    { to: '/groups', label: 'Groups', icon: 'groups' },
    { to: '/matches', label: 'Matches', icon: 'ball' },
    { to: '/bracket', label: 'Bracket', icon: 'bracket' },
    { to: '/picks', label: 'Picks', icon: 'picks' },
    { to: '/leaderboard', label: 'Table', icon: 'chart' }
  ]
  if (isAdmin.value) base.push({ to: '/admin', label: 'Admin', icon: 'shield' })
  return base
})
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-0">
    <div class="mx-auto flex max-w-app items-stretch rounded-2xl border border-white/10 bg-surface-2 shadow-[0_-4px_30px_rgba(0,0,0,0.5)]">
      <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab-link" active-class="active">
        <Icon :name="t.icon" :size="20" />
        <span>{{ t.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
