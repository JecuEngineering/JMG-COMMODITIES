import type { ReactNode } from 'react'
import './ui.css'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">{children}</table>
    </div>
  )
}
