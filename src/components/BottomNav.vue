<script setup>
const tabs = [
  { to: '/groups', label: 'Groups', icon: '🏟️' },
  { to: '/matches', label: 'Matches', icon: '⚽' },
  { to: '/bracket', label: 'Bracket', icon: '🏆' },
  { to: '/picks', label: 'My Picks', icon: '📝' },
  { to: '/leaderboard', label: 'Table', icon: '📊' }
]
</script>

<template>
  <nav class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur safe-bottom">
    <div class="mx-auto flex max-w-app">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        class="tab-link"
        active-class="active"
      >
        <span class="text-lg leading-none">{{ t.icon }}</span>
        <span>{{ t.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
