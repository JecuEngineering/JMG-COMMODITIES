import { useEffect, useMemo, useRef, useState } from 'react'
import './ui.css'

export interface ComboOption {
  value: string
  label: string
  meta?: string
}

interface ComboboxProps {
  id?: string
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}

export function Combobox({ id, value, options, onChange, placeholder = 'Search…', emptyText = 'No matches', disabled }: ComboboxProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        (option.meta ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function commit(option: ComboOption) {
    onChange(option.value)
    setOpen(false)
    setQuery('')
    setHighlight(0)
    inputRef.current?.blur()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      const option = filtered[highlight]
      if (option) {
        event.preventDefault()
        commit(option)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="ui-combo" ref={wrapRef}>
      <input
        id={id}
        ref={inputRef}
        className="ui-input ui-combo-input"
        value={open ? query : selected?.label ?? ''}
        onChange={(event) => {
          setQuery(event.target.value)
          setHighlight(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <svg className="ui-combo-caret" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open ? (
        <div className="ui-combo-list" role="listbox">
          {filtered.length === 0 ? (
            <div className="ui-combo-empty">{emptyText}</div>
          ) : (
            filtered.slice(0, 60).map((option, index) => (
              <button
                type="button"
                key={option.value}
                className={`ui-combo-option${option.value === value ? ' is-selected' : ''}${index === highlight ? ' is-active' : ''}`}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => commit(option)}
              >
                <span>{option.label}</span>
                {option.meta ? <span className="ui-combo-meta">{option.meta}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
