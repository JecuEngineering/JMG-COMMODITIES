import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ROLE_LABELS, navForRole } from '../lib/roles'
import { useCompanySettings } from '../features/settings/useCompanySettings'
import { NotificationsBell } from '../features/notifications/NotificationsBell'
import './shell.css'

const NAV_ICONS: Record<string, string> = {
  dashboard: '⊞',
  sales: '🛒',
  customers: '🤝',
  products: '🌾',
  inventory: '📦',
  containers: '🚢',
  pcf: '💰',
  fund_requests: '📋',
  reports: '📊',
  employees: '👥',
  settings: '⚙️',
  audit: '🕘',
  inquiries: '✉️',
  me: '👤',
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { settings } = useCompanySettings()
  const role = user!.profile.role
  const allNav = navForRole(role)
  const desktopNav = allNav.filter((item) => item.id !== 'me')
  const phoneNav = navForRole(role, true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onResize = () => {
      if (window.innerWidth >= 720) setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  const branchLabel = user!.profile.branch?.name ?? 'All branches / HQ'
  const companyName = settings?.name ?? 'JMG Commodities'
  const logoSrc = settings?.logo_url ?? '/JMG COMMODITIES.jpeg'

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Main navigation">
        <div className="shell-brand">
          <img src={logoSrc} alt="" className="shell-logo" />
          <div className="shell-brand-text">
            <strong>{companyName}</strong>
            <p className="faint">{ROLE_LABELS[role]}</p>
          </div>
        </div>

        <nav className="shell-nav">
          {desktopNav.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/app'}
              title={item.label}
              className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="shell-nav-icon" aria-hidden="true">{NAV_ICONS[item.id] ?? '·'}</span>
              <span className="shell-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shell-sidebar-footer">
          <p style={{ fontWeight: 600 }}>{user!.profile.full_name}</p>
          <p className="faint" style={{ fontSize: '0.8rem', marginTop: 2 }}>{branchLabel}</p>
          <button
            type="button"
            className="shell-signout"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            <span className="shell-signout-icon" aria-hidden="true">⏻</span>
            <span className="shell-signout-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-brand">
            <img src={logoSrc} alt="" className="shell-logo-sm" />
            <div>
              <strong>{companyName}</strong>
              <p className="faint" style={{ fontSize: '0.72rem' }}>{branchLabel}</p>
            </div>
          </div>
          <div className="shell-topbar-meta">
            <NotificationsBell />
            <span>{ROLE_LABELS[role]}</span>
            <button
              type="button"
              className="shell-menu-toggle"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
          </div>
        </header>

        <main className="shell-content">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <div
          className="shell-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="All modules"
          onClick={() => setMenuOpen(false)}
        >
          <div className="shell-mobile-menu-panel" onClick={(event) => event.stopPropagation()}>
            <div className="shell-mobile-menu-head">
              <strong>All modules</strong>
              <button
                type="button"
                className="shell-menu-close"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <nav className="shell-mobile-menu-nav">
              {allNav.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  end={item.path === '/app'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `shell-mobile-menu-link ${isActive ? 'active' : ''}`}
                >
                  <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{NAV_ICONS[item.id] ?? '·'}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="shell-mobile-menu-foot">
              <p style={{ fontWeight: 600 }}>{user!.profile.full_name}</p>
              <p className="faint" style={{ fontSize: '0.8rem', marginTop: 2 }}>{branchLabel}</p>
              <button type="button" className="shell-signout" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="shell-bottom-nav" aria-label="Phone navigation">
        {phoneNav.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/app'}
            className={({ isActive }) => `shell-bottom-link ${isActive ? 'active' : ''}`}
          >
            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{NAV_ICONS[item.id] ?? '·'}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
