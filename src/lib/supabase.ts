import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    '[JMG] Missing VITE_SUPABASE_URL and a key (VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY). Copy .env.example to .env.local.',
  )
}

// The staff system must not stay signed in after the tab or browser closes.
// sessionStorage is per-tab and cleared by the browser, unlike localStorage,
// which is shared and survives restarts.
try {
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i)
    if (key?.startsWith('sb-') && key.includes('-auth-token')) {
      window.localStorage.removeItem(key)
    }
  }
} catch {
  // Private mode or blocked storage: nothing to migrate.
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
