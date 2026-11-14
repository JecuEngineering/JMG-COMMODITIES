import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDate, toDateInputValue } from '../lib/dates'
import './ui.css'

interface DateInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

export function DateInput({ id, value, onChange, placeholder = 'Select date', disabled, ariaLabel, className }: DateInputProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => startOfMonth(value ? new Date(`${value}T00:00:00`) : new Date()))
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })

  const selected = useMemo(() => (value ? new Date(`${value}T00:00:00`) : null), [value])
  const todayKey = toDateInputValue(new Date())

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect()
      const height = 336
      const below = rect.bottom + 6
      const top = below + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : below
      setPosition({ top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 304)), width: Math.max(rect.width, 272) })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    setView(startOfMonth(selected ?? new Date()))
    const onDown = (event: MouseEvent) => {
      if (popRef.current?.contains(event.target as Node)) return
      if (triggerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, selected])

  const days = useMemo(() => {
    const first = startOfMonth(view)
    const lead = first.getDay()
    const total = daysInMonth(view)
    const cells: (string | null)[] = Array.from({ length: lead }, () => null)
    for (let day = 1; day <= total; day += 1) {
      cells.push(toDateInputValue(new Date(view.getFullYear(), view.getMonth(), day)))
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [view])

  function pick(next: string) {
    onChange(next)
    setOpen(false)
  }

  function moveMonth(offset: number) {
    setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  const popover = open ? (
    <div
      ref={popRef}
      className="ui-date-pop"
      style={{ top: position.top, left: position.left, width: position.width }}
      role="dialog"
      aria-label="Choose a date"
    >
      <div className="ui-date-head">
        <button type="button" className="ui-date-nav" onClick={() => moveMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <strong>{monthLabel(view)}</strong>
        <button type="button" className="ui-date-nav" onClick={() => moveMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="ui-date-weekrow">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="ui-date-grid">
        {days.map((day, index) =>
          day ? (
            <button
              type="button"
              key={day}
              className={`ui-date-day${day === value ? ' is-selected' : ''}${day === todayKey ? ' is-today' : ''}`}
              onClick={() => pick(day)}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            <span key={`blank-${index}`} />
          ),
        )}
      </div>
      <div className="ui-date-actions">
        <button type="button" onClick={() => pick(todayKey)}>
          Today
        </button>
        <button type="button" onClick={() => onChange('')} disabled={!value}>
          Clear
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className={`ui-date${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={`ui-date-trigger ui-input${open ? ' is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18" strokeLinecap="round" />
        </svg>
        <span className={value ? undefined : 'ui-date-empty'}>{value ? formatDate(value) : placeholder}</span>
      </button>
      {popover ? createPortal(popover, document.body) : null}
    </div>
  )
}
