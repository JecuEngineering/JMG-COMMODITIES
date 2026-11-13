import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: ModalSize
  busy?: boolean
  footer?: ReactNode
  aside?: ReactNode
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  busy = false,
  footer,
  aside,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // Pages pass an inline arrow for onClose, so keep it in a ref to avoid
  // re-running the effect (and stealing focus) on every form keystroke.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    const { overflow, paddingRight } = document.body.style
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || busyRef.current) return
      event.stopPropagation()
      closeRef.current()
    }

    document.addEventListener('keydown', onKeyDown)
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      ;(first ?? panel).focus({ preventScroll: true })
    }, 40)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      restoreRef.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="ui-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={`ui-modal ui-modal-${size} ${aside ? 'ui-modal-split' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="ui-modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ui-modal-content">
          <div className="ui-modal-body">{children}</div>
          {aside ? <div className="ui-modal-aside">{aside}</div> : null}
        </div>
        {footer ? <footer className="ui-modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
