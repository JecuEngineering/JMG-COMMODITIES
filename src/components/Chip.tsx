import type { ReactNode } from 'react'
import './ui.css'

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  disabled?: boolean
}

export function Chip({ active = false, onClick, children, disabled }: ChipProps) {
  return (
    <button
      type="button"
      className={`ui-chip ${active ? 'ui-chip-active' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="ui-chip-row">{children}</div>
}
