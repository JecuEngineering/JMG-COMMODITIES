import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { ROLE_LABELS, groupedNav, navForRole } from '../lib/roles'
import { useCompanySettings } from '../features/settings/useCompanySettings'
import { NotificationsBell } from '../features/notifications/NotificationsBell'
import { SkeletonTable } from '../components/Loading'
import { Icon } from './Icon'
import './shell.css'

export function AppShell() {
  const { user, signOut } = useAuth()
  const { settings } = useCompanySettings()
  const role = user!.profile.role
  const allNav = navForRole(role)
  const desktopNav = allNav.filter((item) => item.id !== 'me')
  const phoneNav = navForRole(role, true)
  const sidebarGroups = groupedNav(desktopNav)
  const drawerGroups = groupedNav(allNav)
  const ungroupedNav = allNav.filter((item) => !item.group)
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
          {sidebarGroups.map((group) => (
            <div className="shell-nav-group" key={group.id}>
              <p className="shell-nav-group-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  end={item.path === '/app'}
                  title={item.label}
                  className={({ isActive }) => `shell-nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.id} size={18} className="shell-nav-icon" />
                  <span className="shell-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
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
            <Icon name="power" size={16} className="shell-signout-icon" />
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
              <Icon name="menu" size={19} />
            </button>
          </div>
        </header>

        <main className="shell-content">
          <Suspense
            fallback={
              <div className="app-page" aria-busy="true">
                <SkeletonTable rows={5} cols={5} />
              </div>
            }
          >
            <Outlet />
          </Suspense>
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
                <Icon name="close" size={17} />
              </button>
            </div>
            <nav className="shell-mobile-menu-nav">
              {drawerGroups.map((group) => (
                <div className="shell-nav-group" key={group.id}>
                  <p className="shell-nav-group-label">{group.label}</p>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      end={item.path === '/app'}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) => `shell-mobile-menu-link ${isActive ? 'active' : ''}`}
                    >
                      <Icon name={item.id} size={18} className="shell-nav-icon" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
              {ungroupedNav.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `shell-mobile-menu-link ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.id} size={18} className="shell-nav-icon" />
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
            <Icon name={item.id} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
