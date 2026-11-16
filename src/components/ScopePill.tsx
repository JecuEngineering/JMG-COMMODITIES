import { Icon } from '../app/Icon'
import { useAuth } from '../features/auth/AuthContext'
import './ui.css'

interface ScopePillProps {
  label?: string
  className?: string
}

/** Branch/data scope shown above a module title. Defaults to the user's branch. */
export function ScopePill({ label, className = '' }: ScopePillProps) {
  const { user } = useAuth()
  const text = label ?? user?.profile.branch?.name ?? 'All branches / HQ'
  return (
    <span className={`ui-scope ${className}`.trim()}>
      <Icon name="pin" size={15} />
      {text}
    </span>
  )
}
