import { useEffect } from 'react'

const PULSE_TARGET =
  'button, a, [role="button"], .ui-chip, .ui-table tbody tr, .metric-card, .dash-quick-link, input[type="checkbox"], input[type="radio"], summary'

export function ClickPulse() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest(PULSE_TARGET)
      if (!target || target.matches(':disabled')) return
      const pulse = document.createElement('span')
      pulse.className = 'click-pulse'
      pulse.setAttribute('aria-hidden', 'true')
      pulse.style.left = `${event.clientX}px`
      pulse.style.top = `${event.clientY}px`
      document.body.appendChild(pulse)
      const remove = () => pulse.remove()
      pulse.addEventListener('animationend', remove, { once: true })
      window.setTimeout(remove, 700)
    }

    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return null
}
