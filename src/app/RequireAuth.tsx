import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../components/Button'
import { SplashLoader } from '../components/Loading'
import { useAuth } from '../features/auth/AuthContext'

export function RequireAuth() {
  const { user, session, profileLoading, profileError, loading, signOut } = useAuth()
  const location = useLocation()

  if (loading || profileLoading) {
    return (
      <div className="app-page">
        <SplashLoader />
      </div>
    )
  }

  if (!user) {
    if (session && profileError) {
      return (
        <div className="app-page stack">
          <div className="error-banner">{profileError}</div>
          <div>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      )
    }
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!user.profile.active) {
    return (
      <div className="app-page">
        <div className="error-banner">Your account is deactivated. Contact System Admin.</div>
      </div>
    )
  }

  return <Outlet />
}
