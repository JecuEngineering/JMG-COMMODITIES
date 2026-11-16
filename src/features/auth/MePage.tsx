import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ScopePill } from '../../components/ScopePill'
import { ROLE_LABELS } from '../../lib/roles'
import { useAuth } from './AuthContext'

export function MePage() {
  const { user, signOut } = useAuth()
  const profile = user!.profile

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <ScopePill />
          <h1>Me</h1>
          <p>Your account and branch access</p>
        </div>
      </div>

      <Card title={profile.full_name}>
        <div className="stack">
          <p>
            <span className="muted">Role · </span>
            {ROLE_LABELS[profile.role]}
          </p>
          <p>
            <span className="muted">Branch · </span>
            {profile.branch?.name ?? 'HQ / All branches'}
          </p>
          <p>
            <span className="muted">Email · </span>
            {profile.email ?? user!.email ?? '—'}
          </p>
          <p>
            <span className="muted">Phone · </span>
            {profile.phone ?? '—'}
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  )
}
