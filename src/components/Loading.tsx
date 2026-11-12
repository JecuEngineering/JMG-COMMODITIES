import './ui.css'

const LINE_WIDTHS = [92, 78, 64, 84, 70, 88, 58, 74]

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`sk-lines ${className}`.trim()} role="status" aria-live="polite">
      <span className="sr-only">Loading content</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="sk sk-line"
          style={{ width: `${LINE_WIDTHS[index % LINE_WIDTHS.length]}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  cols?: number
}

export function SkeletonTable({ rows = 5, cols = 5 }: SkeletonTableProps) {
  return (
    <div className="sk-table" role="status" aria-live="polite">
      <span className="sr-only">Loading content</span>
      <div className="sk-table-row sk-table-head">
        {Array.from({ length: cols }, (_, index) => (
          <span key={index} className="sk sk-cell" aria-hidden="true" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="sk-table-row" key={row}>
          {Array.from({ length: cols }, (_, col) => (
            <span
              key={col}
              className="sk sk-cell"
              style={{ width: `${LINE_WIDTHS[(row + col) % LINE_WIDTHS.length]}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SplashLoader() {
  return (
    <div className="sk-splash" role="status" aria-live="polite">
      <span className="sk-spinner sk-spinner-lg" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
