import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import type { Profile, SessionUser } from '../../types/database'

interface AuthContextValue {
  loading: boolean
  profileLoading: boolean
  profileError: string | null
  session: Session | null
  user: SessionUser | null
  configured: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function describeAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Email or password is incorrect.'
  if (text.includes('email not confirmed')) {
    return 'This email has not been confirmed yet. Ask System Admin to confirm the account.'
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.'
  }
  if (text.includes('fetch') || text.includes('network')) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return message
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branch:branches(*)')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[JMG] profile fetch failed', error)
    throw error
  }
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const loadSession = useCallback(async (next: Session | null) => {
    setSession(next)
    if (!next?.user) {
      setProfile(null)
      setProfileError(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    try {
      const nextProfile = await fetchProfile(next.user.id)
      setProfile(nextProfile)
      setProfileError(
        nextProfile
          ? null
          : 'Your login is valid, but no employee profile is linked to this account. Ask System Admin to create or restore your profile.',
      )
    } catch (e) {
      setProfile(null)
      setProfileError(e instanceof Error ? e.message : String(e))
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setProfileError(error.message)
          setLoading(false)
          return
        }
        void loadSession(data.session).finally(() => {
          if (mounted) setLoading(false)
        })
      })
      .catch((e) => {
        if (!mounted) return
        setProfileError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'TOKEN_REFRESHED' && nextSession) {
        setSession(nextSession)
        return
      }
      if (event === 'SIGNED_OUT') {
        setSession(null)
        setProfile(null)
        setProfileError(null)
        setProfileLoading(false)
        return
      }
      // Defer Supabase calls: awaiting them inside this callback can deadlock token refresh.
      queueMicrotask(() => {
        if (mounted) void loadSession(nextSession)
      })
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadSession])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: describeAuthError(error.message) }
    return {}
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }
    setProfile(null)
    setSession(null)
    setProfileError(null)
    setProfileLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    setProfileLoading(true)
    try {
      const next = await fetchProfile(session.user.id)
      setProfile(next)
      setProfileError(
        next ? null : 'No employee profile is linked to this account. Ask System Admin to create one.',
      )
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : String(e))
    } finally {
      setProfileLoading(false)
    }
  }, [session])

  const user = useMemo<SessionUser | null>(() => {
    if (!session?.user || !profile) return null
    return {
      id: session.user.id,
      email: session.user.email,
      profile,
    }
  }, [session, profile])

  const value = useMemo(
    () => ({
      loading,
      profileLoading,
      profileError,
      session,
      user,
      configured: isSupabaseConfigured,
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, profileLoading, profileError, session, user, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
