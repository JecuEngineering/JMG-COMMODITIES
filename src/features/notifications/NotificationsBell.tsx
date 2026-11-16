import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SkeletonText } from '../../components/Loading'
import { Icon } from '../../app/Icon'
import { useAuth } from '../auth/AuthContext'
import {
  canApproveFundRequest,
  canReleaseFundRequest,
  canReviewFundRequest,
  canViewContainers,
  canViewFundRequests,
  canViewInquiries,
  canViewInventory,
  canViewPcf,
  canViewSales,
} from '../../lib/roles'
import { fetchOverdueDues } from '../sales/salesApi'
import { fetchStockBalances } from '../inventory/inventoryApi'
import { fetchFundBalances } from '../pcf/pcfApi'
import { supabase } from '../../lib/supabase'
import type { AppRole } from '../../types/database'

interface Alert {
  id: string
  label: string
  count: number
  to: string
  tone: 'warning' | 'danger' | 'muted'
}

function awaitingStatus(role: AppRole): string | null {
  if (canReleaseFundRequest(role)) return 'approved'
  if (canApproveFundRequest(role)) return 'forwarded'
  if (canReviewFundRequest(role)) return 'submitted'
  return null
}

function canSeeOverdue(role: AppRole): boolean {
  return role === 'branch_accountant' || role === 'owner' || role === 'general_accountant' || role === 'system_admin'
}

async function countRows(
  table: string,
  filter: { eq?: [string, string]; is?: [string, null] },
): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter.is) q = q.is(filter.is[0], filter.is[1])
  if (filter.eq) q = q.eq(filter.eq[0], filter.eq[1])
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export function NotificationsBell() {
  const { user } = useAuth()
  const role = user!.profile.role
  const branchId = user!.profile.branch_id
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const next: Alert[] = []
    try {
      const status = awaitingStatus(role)
      if (status && canViewFundRequests(role)) {
        const count = await countRows('fund_requests', {
          is: ['deleted_at', null],
          eq: ['status', status],
        })
        if (count > 0) {
          next.push({
            id: 'fund-requests',
            label: 'Fund requests waiting on you',
            count,
            to: '/app/fund-requests',
            tone: 'warning',
          })
        }
      }

      if (canViewInventory(role) && role !== 'cashier') {
        const rows = await fetchStockBalances(branchId ?? null)
        const low = rows.filter((r) => r.is_low).length
        if (low > 0) {
          next.push({
            id: 'low-stock',
            label: 'Rice variety/branch combinations at or below reorder level',
            count: low,
            to: '/app/inventory',
            tone: low > 5 ? 'danger' : 'warning',
          })
        }
      }

      if (canViewPcf(role)) {
        const funds = await fetchFundBalances()
        const low = funds.filter((f) => f.is_low).length
        if (low > 0) {
          next.push({
            id: 'low-pcf',
            label: 'Petty cash funds running low',
            count: low,
            to: '/app/pcf',
            tone: 'warning',
          })
        }
      }

      if (canViewSales(role) && canSeeOverdue(role)) {
        const dues = await fetchOverdueDues()
        if (dues.length > 0) {
          next.push({
            id: 'overdue',
            label: 'Overdue installment dues',
            count: dues.length,
            to: '/app/sales',
            tone: 'danger',
          })
        }
      }

      if (canViewContainers(role)) {
        const containers = await countRows('containers', {
          is: ['deleted_at', null],
          eq: ['status', 'arrived'],
        })
        if (containers > 0) {
          next.push({
            id: 'containers',
            label: 'Containers arrived and awaiting processing',
            count: containers,
            to: '/app/containers',
            tone: 'warning',
          })
        }
        const transfers = await countRows('transfers', { eq: ['status', 'in_transit'] })
        if (transfers > 0) {
          next.push({
            id: 'transfers',
            label: 'Branch transfers in transit',
            count: transfers,
            to: '/app/inventory',
            tone: 'muted',
          })
        }
      }

      if (canViewInquiries(role)) {
        const inquiries = await countRows('inquiries', { eq: ['status', 'new'] })
        if (inquiries > 0) {
          next.push({
            id: 'inquiries',
            label: 'New website inquiries',
            count: inquiries,
            to: '/app/inquiries',
            tone: 'warning',
          })
        }
      }
    } catch {
      // Alerts are best-effort; individual modules surface their own errors.
    } finally {
      setAlerts(next)
      setLoading(false)
    }
  }, [branchId, role])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
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
  }, [open])

  const total = alerts.reduce((sum, a) => sum + a.count, 0)

  return (
    <div className="shell-notify" ref={panelRef}>
      <button
        type="button"
        className="shell-notify-btn"
        aria-label={`Notifications${total ? ` (${total})` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void load()
        }}
      >
        <Icon name="bell" size={18} />
        {total > 0 ? <span className="shell-notify-count">{total > 99 ? '99+' : total}</span> : null}
      </button>

      {open ? (
        <div className="shell-notify-panel" role="dialog" aria-label="Notifications">
          <div className="shell-notify-head">
            <strong>Notifications</strong>
            <button type="button" className="shell-menu-close" aria-label="Close notifications" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          {loading ? (
            <SkeletonText lines={3} className="sk-notify" />
          ) : alerts.length === 0 ? (
            <p className="faint" style={{ padding: '12px 16px' }}>Nothing needs attention right now.</p>
          ) : (
            <div className="shell-notify-list">
              {alerts.map((alert) => (
                <Link key={alert.id} to={alert.to} className="shell-notify-item" onClick={() => setOpen(false)}>
                  <span className={`shell-notify-dot ${alert.tone}`} />
                  <span className="shell-notify-text">{alert.label}</span>
                  <span className="shell-notify-num">{alert.count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
