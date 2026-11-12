import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './ui.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  fullWidth?: boolean
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  loading = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn-${variant} ${fullWidth ? 'ui-btn-full' : ''} ${loading ? 'ui-btn-loading' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="ui-btn-label">{children}</span>
      {loading ? <span className="ui-btn-spinner" aria-hidden="true" /> : null}
    </button>
  )
}
