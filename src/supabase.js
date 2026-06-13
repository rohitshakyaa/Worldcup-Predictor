import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Whether the app has been configured (used to show a friendly setup notice
// instead of crashing when .env.local is unfilled).
export const isConfigured =
  !!url && !!anon && !url.includes('YOUR-PROJECT') && !anon.includes('YOUR-PUBLIC')

export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase()
export const RESULTS_URL = import.meta.env.VITE_RESULTS_URL || './wc2026_matches.json'

// Create a client even when unconfigured (with harmless placeholders) so module
// imports don't throw; guarded calls check isConfigured first.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key'
)
