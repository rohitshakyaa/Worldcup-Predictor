<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import Icon from '../components/Icon.vue'

const auth = useAuthStore()
const router = useRouter()
const mode = ref('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const msg = ref('')
const busy = ref(false)

async function submit() {
  msg.value = ''; busy.value = true
  try {
    if (mode.value === 'login') {
      await auth.signIn(email.value.trim(), password.value)
    } else {
      await auth.signUp(email.value.trim(), password.value, displayName.value.trim())
      await auth.signIn(email.value.trim(), password.value)
    }
    router.push('/groups')
  } catch (e) {
    msg.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[70vh] items-center">
    <div class="card mx-auto w-full max-w-sm p-6 space-y-4">
      <div class="text-center">
        <div class="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Icon name="trophy" :size="30" />
        </div>
        <h1 class="font-display text-3xl font-bold">World Cup <span class="text-brand">2026</span></h1>
        <p class="text-sm text-muted">{{ mode === 'login' ? 'Sign in to play' : 'Create your account' }}</p>
      </div>

      <input v-if="mode==='signup'" class="input" v-model="displayName" placeholder="Display name" />
      <input class="input" v-model="email" type="email" placeholder="Email" autocomplete="email" />
      <input class="input" v-model="password" type="password" placeholder="Password" autocomplete="current-password" />

      <button class="btn-brand w-full" :disabled="busy || !email || !password" @click="submit">
        {{ busy ? '…' : (mode === 'login' ? 'Sign in' : 'Sign up') }}
      </button>

      <p class="text-center text-sm text-muted">
        <template v-if="mode==='login'">
          No account? <button class="font-semibold text-brand" @click="mode='signup'">Sign up</button>
        </template>
        <template v-else>
          Have an account? <button class="font-semibold text-brand" @click="mode='login'">Sign in</button>
        </template>
      </p>

      <p v-if="msg" class="text-center text-sm text-red-500">{{ msg }}</p>
    </div>
  </div>
</template>
