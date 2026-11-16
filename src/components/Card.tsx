import type { ReactNode, Ref } from 'react'
import './ui.css'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  action?: ReactNode
  ref?: Ref<HTMLElement>
}

export function Card({ children, className = '', title, subtitle, action, ref }: CardProps) {
  return (
    <section ref={ref} className={`ui-card ${className}`.trim()}>
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
