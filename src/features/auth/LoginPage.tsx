import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Field, TextInput } from '../../components/Field'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthContext'
import './auth.css'

interface CompanyLogo {
  name: string
  logo_url: string | null
}

export function LoginPage() {
  const { signIn, user, loading, configured, profileError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [company, setCompany] = useState<CompanyLogo>({
    name: 'JMG Commodities Inc.',
    logo_url: null,
  })

  useEffect(() => {
    if (!configured) return
    void supabase
      .from('company_settings')
      .select('name, logo_url')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCompany({ name: data.name, logo_url: data.logo_url })
      })
  }, [configured])

  if (!loading && user) {
    return <Navigate to="/app" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  const logoSrc = company.logo_url ?? '/JMG COMMODITIES.jpeg'

  return (
    <div className="login-page">
      {/* Left hero panel */}
      <div className="login-hero">
        <div className="login-hero-bg" />
        <div className="login-hero-gradient" />
        <div className="login-hero-content">
          <img src={logoSrc} alt="JMG Commodities" className="login-hero-logo" />
          <h2>
            Premium Rice,<br />
            <span>Delivered Fresh</span>
          </h2>
          <p>
            Your all-in-one platform for sales, inventory, expenses, petty cash,
            and fund management — built for JMG Commodities Inc.
          </p>
          <div className="login-hero-badges">
            <span className="login-hero-badge">🌾 Kasikas Jasmine</span>
            <span className="login-hero-badge">🍚 Japonica</span>
            <span className="login-hero-badge">🌾 White Rice</span>
            <span className="login-hero-badge">🌾 Parboiled</span>
            <span className="login-hero-badge">🍡 Glutinous</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-panel">
        <div className="login-panel-inner">
          <div className="login-brand">
            <img src={logoSrc} alt={company.name} className="login-logo" />
            <h1>{company.name}</h1>
            <p>Staff portal · branch-aware access</p>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            {!configured ? (
              <div className="error-banner">
                Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, then restart the dev server.
              </div>
            ) : null}
            {profileError ? <div className="error-banner">{profileError}</div> : null}
            {error ? <div className="error-banner">{error}</div> : null}

            <Field label="Email" htmlFor="email">
              <TextInput
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@jmgcommodities.ph"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <TextInput
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            <Button type="submit" fullWidth disabled={submitting || !configured}>
              {submitting ? 'Signing in…' : 'Sign in →'}
            </Button>
          </form>

          <div className="login-footer">
            <Link to="/">← Back to website</Link>
            &nbsp;·&nbsp; © {new Date().getFullYear()} JMG Commodities Inc.
          </div>
        </div>
      </div>
    </div>
  )
}
