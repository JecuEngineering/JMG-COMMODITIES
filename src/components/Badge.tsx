import type { ReactNode } from 'react'
import './ui.css'

interface BadgeProps {
  children: ReactNode
  tone?: 'default' | 'warning' | 'danger' | 'muted'
}

export function Badge({ children, tone = 'default' }: BadgeProps) {
  const toneClass =
    tone === 'warning'
      ? 'ui-badge-warning'
      : tone === 'danger'
        ? 'ui-badge-danger'
        : tone === 'muted'
          ? 'ui-badge-muted'
          : ''
  return <span className={`ui-badge ${toneClass}`.trim()}>{children}</span>
}
