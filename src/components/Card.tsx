import type { ReactNode } from 'react'
import './ui.css'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function Card({ children, className = '', title, subtitle, action }: CardProps) {
  return (
    <section className={`ui-card ${className}`.trim()}>
      {(title || action) && (
        <header className="ui-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
