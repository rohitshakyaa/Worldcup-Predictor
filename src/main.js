import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index.js'
import App from './App.vue'
import './style.css'
import { useAuthStore } from './stores/auth.js'

const app = createApp(App)
app.use(createPinia())

// Initialise auth before mounting so route guards have a session.
const auth = useAuthStore()
auth.init().finally(() => {
  app.use(router)
  app.mount('#app')
})
