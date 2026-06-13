<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useLeaguesStore } from '../stores/leagues.js'

const lg = useLeaguesStore()
const { leagues, currentLeague } = storeToRefs(lg)

const open = ref(false)
const mode = ref('switch') // switch | create | join
const name = ref('')
const code = ref('')
const msg = ref('')
const busy = ref(false)

async function create() {
  msg.value = ''; busy.value = true
  try { await lg.createLeague(name.value.trim()); name.value=''; open.value=false }
  catch (e) { msg.value = e.message } finally { busy.value = false }
}
async function join() {
  msg.value = ''; busy.value = true
  try { await lg.joinByCode(code.value.trim()); code.value=''; open.value=false }
  catch (e) { msg.value = e.message } finally { busy.value = false }
}
function pick(id) { lg.setCurrent(id); open.value = false }
</script>

<template>
  <div class="relative">
    <button class="btn-ghost btn-sm" @click="open = !open">
      <span class="truncate max-w-[10rem]">{{ currentLeague?.name || 'No league' }}</span>
      <span class="text-muted">▾</span>
    </button>

    <div v-if="open" class="absolute right-0 z-30 mt-2 w-72 card p-3 space-y-2">
      <div class="flex gap-1 text-xs">
        <button class="btn-ghost btn-sm flex-1" :class="{'!bg-brand !text-brand-ink': mode==='switch'}" @click="mode='switch'">Switch</button>
        <button class="btn-ghost btn-sm flex-1" :class="{'!bg-brand !text-brand-ink': mode==='create'}" @click="mode='create'">Create</button>
        <button class="btn-ghost btn-sm flex-1" :class="{'!bg-brand !text-brand-ink': mode==='join'}" @click="mode='join'">Join</button>
      </div>

      <div v-if="mode==='switch'" class="space-y-1">
        <p v-if="!leagues.length" class="text-sm text-muted">You're not in a league yet. Create or join one.</p>
        <button
          v-for="l in leagues" :key="l.id"
          class="w-full text-left rounded-lg px-2 py-1.5 hover:bg-surface"
          :class="{'bg-brand/10 font-semibold': l.id === currentLeague?.id}"
          @click="pick(l.id)"
        >
          {{ l.name }} <span class="text-xs text-muted">· {{ l.invite_code }}</span>
        </button>
      </div>

      <div v-else-if="mode==='create'" class="space-y-2">
        <input class="input" v-model="name" placeholder="League name" />
        <button class="btn-brand w-full" :disabled="busy || !name.trim()" @click="create">Create league</button>
      </div>

      <div v-else class="space-y-2">
        <input class="input uppercase" v-model="code" placeholder="Invite code" />
        <button class="btn-brand w-full" :disabled="busy || !code.trim()" @click="join">Join league</button>
      </div>

      <p v-if="msg" class="text-xs text-red-500">{{ msg }}</p>
    </div>
  </div>
</template>
