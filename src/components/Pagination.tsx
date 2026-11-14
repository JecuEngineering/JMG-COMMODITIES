import { useEffect, useMemo, useState } from 'react'
import './ui.css'

export const PAGE_SIZES = [10, 25, 50] as const

export function usePaged<T>(items: T[], initialSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(initialSize)

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, pageCount)

  useEffect(() => {
    if (page !== current) setPage(current)
  }, [page, current])

  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  )

  return {
    page: current,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
    pageItems,
    pageCount,
    total: items.length,
    start: items.length === 0 ? 0 : (current - 1) * pageSize + 1,
    end: Math.min(current * pageSize, items.length),
  }
}

interface PaginationProps {
  page: number
  pageCount: number
  pageSize: number
  total: number
  start: number
  end: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  noun?: string
}

function pageWindow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set<number>([1, 2, pageCount - 1, pageCount, page - 1, page, page + 1])
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  const result: (number | '…')[] = []
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) result.push('…')
    result.push(value)
  })
  return result
}

export function Pagination({ page, pageCount, pageSize, total, start, end, onPage, onPageSize, noun = 'row' }: PaginationProps) {
  if (total === 0) return null

  return (
    <div className="ui-pager">
      <div className="ui-pager-size">
        <span>Rows per page</span>
        <select
          className="ui-pager-select"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-pager-count">
        {start}–{end} of {total} {noun}
        {total === 1 ? '' : 's'}
      </div>
      {pageCount > 1 ? (
        <div className="ui-pager-pages">
          <button type="button" className="ui-pager-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹
          </button>
          {pageWindow(page, pageCount).map((value, index) =>
            value === '…' ? (
              <span key={`gap-${index}`} className="ui-pager-gap">
                …
              </span>
            ) : (
              <button
                type="button"
                key={value}
                className={`ui-pager-btn${value === page ? ' is-active' : ''}`}
                onClick={() => onPage(value)}
                aria-current={value === page ? 'page' : undefined}
              >
                {value}
              </button>
            ),
          )}
          <button type="button" className="ui-pager-btn" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            ›
          </button>
        </div>
      ) : null}
    </div>
  )
}
