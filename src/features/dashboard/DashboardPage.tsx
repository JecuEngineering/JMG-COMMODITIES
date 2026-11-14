import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SkeletonText } from '../../components/Loading'
import { Card } from '../../components/Card'
import { SelectInput } from '../../components/Field'
import { useAuth } from '../auth/AuthContext'
import {
  canViewAllBranchesReports,
  canViewContainers,
  canViewFundRequests,
  canViewPcf,
  canViewSales,
} from '../../lib/roles'
import { fetchBranches, fetchStockBalances, type StockBalanceRow } from '../inventory/inventoryApi'
import { fetchOverdueDues, fetchSales, type InstallmentDue, type Sale } from '../sales/salesApi'
import { fetchContainers, type Container } from '../containers/containersApi'
import { fetchFundBalances, type PcfFundBalance } from '../pcf/pcfApi'
import { fetchFundRequests, type FundRequest, type FundRequestStatus } from '../fund-requests/fundRequestsApi'
import { supabase } from '../../lib/supabase'
import { formatPhp } from '../../lib/money'
import { todayInputValue, toDateInputValue } from '../../lib/dates'
import type { Branch } from '../../types/database'
import './dashboard.css'

const ACTIONABLE: Record<string, FundRequestStatus[]> = {
  branch_accountant: ['submitted'],
  owner: ['forwarded'],
  general_accountant: ['approved'],
}

interface PaymentRow {
  amount: number
  method: string
  payment_date: string
  sale: { branch_id: string } | null
}

interface AttentionItem {
  key: string
  tone: 'warning' | 'danger' | 'ok'
  count: number
  label: string
  action: string
  to: string
}

function compactPhp(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  }
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}k`
  return formatPhp(value)
}

export function DashboardPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const profileBranchId = user!.profile.branch_id
  const canViewAll = canViewAllBranchesReports(role)

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>(canViewAll ? '' : profileBranchId ?? '')
  const [sales, setSales] = useState<Sale[]>([])
  const [balances, setBalances] = useState<StockBalanceRow[]>([])
  const [funds, setFunds] = useState<PcfFundBalance[]>([])
  const [fundRequests, setFundRequests] = useState<FundRequest[]>([])
  const [paymentsToday, setPaymentsToday] = useState(0)
  const [paymentsYesterday, setPaymentsYesterday] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [nextContainer, setNextContainer] = useState<Container | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canViewAll) return
    fetchBranches().then(setBranches).catch(() => setBranches([]))
  }, [canViewAll])

  useEffect(() => {
    let cancelled = false
    const today = todayInputValue()
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = toDateInputValue(yesterdayDate)
    const branchFilter = branchId || null

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [saleRows, balanceRows, fundRows, requestRows, paymentRes, dueRows, containerRows] =
          await Promise.all([
            canViewSales(role) ? fetchSales(branchFilter) : Promise.resolve([]),
            fetchStockBalances(branchFilter),
            canViewPcf(role) ? fetchFundBalances() : Promise.resolve([]),
            canViewFundRequests(role) ? fetchFundRequests() : Promise.resolve([]),
            supabase
              .from('payments')
              .select('amount, method, payment_date, sale:sales(branch_id)')
              .in('payment_date', [today, yesterday])
              .eq('method', 'cash'),
            canViewSales(role) ? fetchOverdueDues() : Promise.resolve([]),
            canViewContainers(role) ? fetchContainers() : Promise.resolve([]),
          ])
        if (cancelled) return

        if (paymentRes.error) throw paymentRes.error
        const todayPayments = ((paymentRes.data as unknown as PaymentRow[]) ?? []).filter(
          (p) => !branchFilter || p.sale?.branch_id === branchFilter,
        )

        const scopedDues = (dueRows as InstallmentDue[]).filter(
          (d) => !branchFilter || d.plan?.sale?.branch_id === branchFilter,
        )
        const upcoming = (containerRows as Container[])
          .filter(
            (c) =>
              (c.status === 'in_transit' || c.status === 'arrived') &&
              !!c.expected_arrival &&
              c.expected_arrival >= today &&
              (!branchFilter || c.primary_branch_id === branchFilter),
          )
          .sort((a, b) => (a.expected_arrival ?? '').localeCompare(b.expected_arrival ?? ''))

        setSales(saleRows)
        setBalances(balanceRows)
        setFunds(fundRows)
        setFundRequests(requestRows)
        setPaymentsToday(
          todayPayments
            .filter((p) => p.payment_date === today)
            .reduce((sum, p) => sum + Number(p.amount), 0),
        )
        setPaymentsYesterday(
          todayPayments
            .filter((p) => p.payment_date === yesterday)
            .reduce((sum, p) => sum + Number(p.amount), 0),
        )
        setOverdueCount(scopedDues.length)
        setNextContainer(upcoming[0] ?? null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [branchId, canViewPcf, canViewSales, canViewFundRequests, role])

  const today = todayInputValue()
  const todayRows = sales.filter((s) => s.sale_date === today)
  const todaySales = todayRows.reduce((sum, s) => sum + Number(s.total), 0)
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayRows = sales.filter((s) => s.sale_date === toDateInputValue(yesterdayDate))
  const yesterdaySales = yesterdayRows.reduce((sum, s) => sum + Number(s.total), 0)
  const receivables = sales.reduce((sum, s) => sum + Number(s.balance), 0)

  const branchFunds = branchId ? funds.filter((f) => f.branch_id === branchId) : funds
  const pettyCash = branchFunds.reduce((sum, f) => sum + Number(f.balance), 0)
  const pettyCashLow = branchFunds.some((f) => f.is_low)

  const last7 = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const sale of sales) {
      byDate.set(sale.sale_date, (byDate.get(sale.sale_date) ?? 0) + Number(sale.total))
    }
    return Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index
      const d = new Date()
      d.setDate(d.getDate() - offset)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return {
        key,
        label: offset === 0 ? 'Today' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        total: byDate.get(key) ?? 0,
        isToday: offset === 0,
      }
    })
  }, [sales])
  const weekTotal = last7.reduce((sum, day) => sum + day.total, 0)
  const weekMax = Math.max(...last7.map((day) => day.total), 0)

  const varietyTotals = (() => {
    const start = last7[0]?.key ?? today
    const totals = new Map<string, number>()
    for (const sale of sales) {
      if (sale.sale_date < start) continue
      for (const item of sale.items ?? []) {
        const name = item.sku?.variety?.name ?? 'Other'
        totals.set(name, (totals.get(name) ?? 0) + Number(item.line_total))
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  })()
  const varietyMax = varietyTotals[0]?.[1] ?? 0

  const outStockCount = balances.filter((row) => row.on_hand <= 0).length
  const lowStockCount = balances.filter((row) => row.on_hand > 0 && row.is_low).length

  const awaiting = (() => {
    if (!canViewFundRequests(role)) return []
    let statuses = ACTIONABLE[role as string]
    if (role === 'system_admin') statuses = ['submitted', 'forwarded', 'approved']
    if (!statuses) statuses = ['submitted', 'forwarded', 'approved']
    return fundRequests
      .filter((r) => statuses.includes(r.status) && (!branchId || r.branch_id === branchId))
      .slice(0, 5)
  })()

  const attention: AttentionItem[] = []
  if (canViewFundRequests(role) && awaiting.length > 0) {
    attention.push({
      key: 'requests',
      tone: 'warning',
      count: awaiting.length,
      label: 'Fund requests waiting on you',
      action: 'Review',
      to: '/app/fund-requests',
    })
  }
  if (outStockCount + lowStockCount > 0) {
    attention.push({
      key: 'stock',
      tone: outStockCount > 0 ? 'danger' : 'warning',
      count: outStockCount || lowStockCount,
      label:
        outStockCount > 0
          ? `Out of stock, ${lowStockCount} low`
          : `${lowStockCount} low stock`,
      action: 'View stock',
      to: '/app/inventory',
    })
  }
  if (canViewSales(role) && overdueCount > 0) {
    attention.push({
      key: 'overdue',
      tone: 'warning',
      count: overdueCount,
      label: 'Overdue installments',
      action: 'View',
      to: '/app/sales',
    })
  }
  if (nextContainer?.expected_arrival) {
    const arriveLabel = new Date(`${nextContainer.expected_arrival}T00:00:00`).toLocaleDateString(
      'en-PH',
      { month: 'short', day: 'numeric' },
    )
    attention.push({
      key: 'container',
      tone: 'ok',
      count: 1,
      label: `Container arriving ${arriveLabel}`,
      action: 'View',
      to: '/app/containers',
    })
  }

  const dateStr = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const scopeLabel = branchId
    ? branches.find((b) => b.id === branchId)?.name ?? user!.profile.branch?.name ?? 'Branch'
    : 'All branches'

  return (
    <div className="app-page stack" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            {scopeLabel} · {dateStr}
          </p>
        </div>
        {canViewAll ? (
          <SelectInput
            className="dash-branch-pick"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Dashboard branch"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </SelectInput>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="dash-metrics">
        <div className="dash-metric">
          <span className="dash-metric-label">Today's sales</span>
          <strong className="dash-metric-value">{loading ? '—' : formatPhp(todaySales)}</strong>
          <span className="dash-metric-sub">
            {todayRows.length} sale{todayRows.length === 1 ? '' : 's'}
            {yesterdaySales > 0 ? ` · yesterday ${formatPhp(yesterdaySales)}` : ''}
          </span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Cash on hand</span>
          <strong className="dash-metric-value">{loading ? '—' : formatPhp(paymentsToday)}</strong>
          <span className="dash-metric-sub">
            Cash payments only
            {paymentsYesterday > 0 ? ` · yesterday ${formatPhp(paymentsYesterday)}` : ''}
          </span>
        </div>
        <div className="dash-metric">
          <span className="dash-metric-label">Customer balances</span>
          <strong className="dash-metric-value">{loading ? '—' : formatPhp(receivables)}</strong>
          <span className="dash-metric-sub">Installments, no interest</span>
        </div>
        {canViewPcf(role) ? (
          <div className={`dash-metric${pettyCashLow ? ' is-warning' : ''}`}>
            <span className="dash-metric-label">Petty cash</span>
            <strong className="dash-metric-value">{loading ? '—' : formatPhp(pettyCash)}</strong>
            <span className="dash-metric-sub">
              {pettyCashLow ? 'Replenish soon' : 'Within threshold'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="dash-split">
        {canViewSales(role) ? (
          <Card
            title="Sales, last 7 days"
            action={<span className="dash-chart-total">{formatPhp(weekTotal)} total</span>}
          >
            {loading ? (
              <SkeletonText lines={4} />
            ) : (
              <div className="dash-chart">
                {last7.map((day) => (
                  <div className="dash-chart-col" key={day.key}>
                    <div className="dash-chart-plot">
                      <div
                        className={`dash-chart-bar${day.isToday ? ' is-today' : ''}`}
                        style={{
                          height: `${day.total > 0 && weekMax > 0 ? Math.max(4, (day.total / weekMax) * 100) : 0}%`,
                        }}
                        title={`${day.label}: ${formatPhp(day.total)}`}
                      />
                    </div>
                    <span className="dash-chart-label">{day.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        <Card title="Needs attention">
          {loading ? (
            <SkeletonText lines={3} />
          ) : attention.length === 0 ? (
            <p className="faint">Nothing needs attention right now.</p>
          ) : (
            <div className="dash-attention">
              {attention.map((item) => (
                <div className="dash-attn-row" key={item.key}>
                  <span className={`dash-attn-count${item.tone === 'danger' ? ' is-danger' : item.tone === 'ok' ? ' is-ok' : ''}`}>
                    {item.count}
                  </span>
                  <span className="dash-attn-label">{item.label}</span>
                  <Link to={item.to} className="dash-attn-link">{item.action}</Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {canViewSales(role) ? (
        <Card title="Sales by variety · this week">
          {loading ? (
            <SkeletonText lines={4} />
          ) : varietyTotals.length === 0 ? (
            <p className="faint">No sales in the last 7 days for this scope.</p>
          ) : (
            <div className="dash-bars">
              {varietyTotals.map(([name, amount]) => (
                <div className="dash-bar-row" key={name}>
                  <span className="dash-bar-label">{name}</span>
                  <span className="dash-bar-track">
                    <span
                      className="dash-bar-fill"
                      style={{ width: `${varietyMax ? Math.max(4, (amount / varietyMax) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="dash-bar-value">{compactPhp(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {!canViewSales(role) ? (
        <Card title="Welcome to JMG Staff System">
          <p className="muted" style={{ lineHeight: 1.7 }}>
            Manage your assigned tasks from the sidebar. Sales, inventory, and report metrics appear here for roles with access.
            Contact your System Admin to update your role or branch assignment.
          </p>
        </Card>
      ) : null}
    </div>
  )
}
