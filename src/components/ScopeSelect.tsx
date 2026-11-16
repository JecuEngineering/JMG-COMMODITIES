import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from '../app/Icon'
import './ui.css'

export interface ScopeOption {
  value: string
  label: string
}

interface ScopeSelectProps {
  value: string
  onChange: (value: string) => void
  options: ScopeOption[]
  ariaLabel: string
  className?: string
}

/** Pill-shaped branch/scope switcher that matches the ScopePill label. */
export function ScopeSelect({ value, onChange, options, ariaLabel, className = '' }: ScopeSelectProps) {
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const [active, setActive] = useState(selectedIndex)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId().replace(/:/g, '')
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    document.getElementById(`${baseId}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, baseId])

  function openList(index = selectedIndex) {
    setActive(index)
    setOpen(true)
  }

  function closeList(returnFocus = true) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function choose(option: ScopeOption) {
    onChange(option.value)
    closeList()
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openList(selectedIndex)
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((current) => Math.min(options.length - 1, current + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((current) => Math.max(0, current - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(options[active])
        break
      case 'Escape':
        event.preventDefault()
        closeList()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className={`ui-scope-select ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="ui-scope-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name="pin" size={16} className="ui-scope-select-icon" />
        <span className="ui-scope-select-label">{options[selectedIndex]?.label ?? ''}</span>
        <Icon name="chevron-down" size={16} className="ui-scope-select-caret" />
      </button>

      {open ? (
        <div
          id={listId}
          ref={listRef}
          className="ui-scope-select-panel"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => {
            const selected = option.value === value
            const classes = [
              'ui-scope-select-option',
              index === active ? 'is-active' : '',
              selected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={option.value || 'all'}
                id={optionId(index)}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                className={classes}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span className="ui-scope-select-option-label">{option.label}</span>
                {selected ? <Icon name="check" size={15} className="ui-scope-select-check" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
