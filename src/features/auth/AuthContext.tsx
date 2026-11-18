import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const IDLE_TIMEOUT_MS = 5 * 60_000
const IDLE_CHECK_MS = 20_000
const ACTIVITY_SHARE_MS = 5_000
const ACTIVITY_STORAGE_KEY = 'jmg:last-activity'
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

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
  // User id whose profile has already been fetched (or attempted). Focus
  // re-notifications for the same user must not trigger another fetch.
  const profileUserIdRef = useRef<string | null>(null)
  const accessTokenRef = useRef<string | null>(null)

  const loadSession = useCallback(async (next: Session | null) => {
    accessTokenRef.current = next?.access_token ?? null
    setSession(next)
    if (!next?.user) {
      profileUserIdRef.current = null
      setProfile(null)
      setProfileError(null)
      setProfileLoading(false)
      return
    }
    profileUserIdRef.current = next.user.id
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
      // Allow the next focus event to retry after a transient failure.
      profileUserIdRef.current = null
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
      if (event === 'SIGNED_OUT') {
        profileUserIdRef.current = null
        accessTokenRef.current = null
        setSession(null)
        setProfile(null)
        setProfileError(null)
        setProfileLoading(false)
        return
      }
      // Supabase re-emits SIGNED_IN with the stored session whenever a browser
      // tab regains focus, not just on a real login. Same user + same token
      // means nothing to do; and even a rotated token only needs a session
      // swap — refetching the profile would flip RequireAuth back to its splash
      // and remount every page, which is the "it always loads" symptom.
      const nextUserId = nextSession?.user.id ?? null
      if (!nextUserId) return
      if (profileUserIdRef.current === nextUserId) {
        if (nextSession && nextSession.access_token !== accessTokenRef.current) {
          accessTokenRef.current = nextSession.access_token
          setSession(nextSession)
        }
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

  // Local scope: a shared branch account is often open on several devices, and
  // the default global scope would revoke every one of them.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    profileUserIdRef.current = null
    accessTokenRef.current = null
    setProfile(null)
    setSession(null)
    setProfileError(null)
    setProfileLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    profileUserIdRef.current = session.user.id
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

  // Depend on scalars, not the session object: TOKEN_REFRESHED (fired when a
  // browser tab regains focus) replaces the session, and a new `user` object
  // would make every page reload its data and flash a skeleton.
  const userId = session?.user.id ?? null
  const userEmail = session?.user.email

  // Sign the operator out after five minutes without keyboard, mouse, or touch
  // input. Background timers are throttled, so a hidden tab is also checked as
  // soon as it becomes visible again. Activity is shared through localStorage:
  // tabs share one session, so an idle background tab must not sign out a tab
  // that is still in use.
  useEffect(() => {
    if (!userId) return
    let lastActivity = Date.now()
    let lastShared = 0
    let signedOut = false

    const share = (at: number) => {
      lastShared = at
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(at))
      } catch {
        // storage unavailable (private mode); fall back to this tab only
      }
    }

    const latestActivity = () => {
      const stored = Number(localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? 0)
      return Math.max(lastActivity, Number.isFinite(stored) ? stored : 0)
    }

    const touch = () => {
      lastActivity = Date.now()
      if (lastActivity - lastShared > ACTIVITY_SHARE_MS) share(lastActivity)
    }

    const checkIdle = () => {
      if (signedOut || Date.now() - latestActivity() < IDLE_TIMEOUT_MS) return
      signedOut = true
      void signOut()
    }

    share(lastActivity)
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, touch, { passive: true, capture: true })
    }
    document.addEventListener('visibilitychange', checkIdle)
    const timer = window.setInterval(checkIdle, IDLE_CHECK_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, touch, { capture: true })
      }
      document.removeEventListener('visibilitychange', checkIdle)
      window.clearInterval(timer)
    }
  }, [userId, signOut])
  const user = useMemo<SessionUser | null>(() => {
    if (!userId || !profile) return null
    return {
      id: userId,
      email: userEmail,
      profile,
    }
  }, [userId, userEmail, profile])

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
