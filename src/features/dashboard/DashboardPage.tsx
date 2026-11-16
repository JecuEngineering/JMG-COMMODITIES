import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SkeletonText } from '../../components/Loading'
import { Card } from '../../components/Card'
import { ScopePill } from '../../components/ScopePill'
import { ScopeSelect } from '../../components/ScopeSelect'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import {
  canViewAllBranchesReports,
  canViewFundRequests,
  canViewInventory,
  canViewPcf,
  canViewSales,
} from '../../lib/roles'
import { fetchBranches, fetchStockBalances, type StockBalanceRow } from '../inventory/inventoryApi'
import {
  fetchCashCollected,
  fetchOpenBalanceTotal,
  fetchOverdueDues,
  fetchSalesDayTotals,
  fetchVarietyTotals,
  type InstallmentDue,
  type SalesDayTotal,
} from '../sales/salesApi'
import { fetchFundBalances, type PcfFundBalance } from '../pcf/pcfApi'
import { fetchFundRequests, type FundRequest, type FundRequestStatus } from '../fund-requests/fundRequestsApi'
import { formatPhp } from '../../lib/money'
import { todayInputValue, toDateInputValue } from '../../lib/dates'
import type { Branch } from '../../types/database'
import './dashboard.css'

const ACTIONABLE: Record<string, FundRequestStatus[]> = {
  branch_accountant: ['submitted'],
  owner: ['forwarded'],
  general_accountant: ['approved'],
}

const REQUEST_STATUS: Record<string, { label: string; tone: 'warning' | 'ok' }> = {
  submitted: { label: 'Waiting on accounting', tone: 'warning' },
  forwarded: { label: 'Waiting on owner', tone: 'warning' },
  approved: { label: 'Ready to release', tone: 'ok' },
}

const STATUS_RANK = { out: 0, low: 1, ok: 2 } as const

function compactPhp(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  }
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}k`
  return formatPhp(value)
}

const integerFormat = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })

function badgeClass(tone: 'warning' | 'ok' | 'danger' | 'muted') {
  if (tone === 'warning') return 'ui-badge ui-badge-warning'
  if (tone === 'danger') return 'ui-badge ui-badge-danger'
  if (tone === 'muted') return 'ui-badge ui-badge-muted'
  return 'ui-badge'
}

export function DashboardPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const profileBranchId = user!.profile.branch_id
  const canViewAll = canViewAllBranchesReports(role)
  const salesAccess = canViewSales(role)
  const stockAccess = canViewInventory(role)
  const pcfAccess = canViewPcf(role)
  const requestsAccess = canViewFundRequests(role)

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>(canViewAll ? '' : profileBranchId ?? '')
  const [dayTotals, setDayTotals] = useState<SalesDayTotal[]>([])
  const [varietyRows, setVarietyRows] = useState<[string, number][]>([])
  const [receivables, setReceivables] = useState(0)
  const [balances, setBalances] = useState<StockBalanceRow[]>([])
  const [funds, setFunds] = useState<PcfFundBalance[]>([])
  const [fundRequests, setFundRequests] = useState<FundRequest[]>([])
  const [paymentsToday, setPaymentsToday] = useState(0)
  const [paymentsYesterday, setPaymentsYesterday] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
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
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 6)
    const since = toDateInputValue(weekStart)
    const branchFilter = branchId || null

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [dayRows, openBalance, varietyTotalsRows, balanceRows, fundRows, requestRows, cashRows, dueRows] =
          await Promise.all([
            salesAccess ? fetchSalesDayTotals(branchFilter, since) : Promise.resolve([]),
            salesAccess ? fetchOpenBalanceTotal(branchFilter) : Promise.resolve({ total: 0, count: 0 }),
            salesAccess ? fetchVarietyTotals(branchFilter, since) : Promise.resolve([]),
            stockAccess ? fetchStockBalances(branchFilter) : Promise.resolve([]),
            pcfAccess ? fetchFundBalances() : Promise.resolve([]),
            requestsAccess ? fetchFundRequests() : Promise.resolve([]),
            salesAccess ? fetchCashCollected(branchFilter, [today, yesterday]) : Promise.resolve([]),
            salesAccess ? fetchOverdueDues() : Promise.resolve([]),
          ])
        if (cancelled) return

        const scopedDues = (dueRows as InstallmentDue[]).filter(
          (d) => !branchFilter || d.plan?.sale?.branch_id === branchFilter,
        )

        setDayTotals(dayRows)
        setVarietyRows(varietyTotalsRows)
        setReceivables(openBalance.total)
        setBalances(balanceRows)
        setFunds(fundRows)
        setFundRequests(requestRows)
        setPaymentsToday(cashRows.filter((p) => p.payment_date === today).reduce((sum, p) => sum + p.amount, 0))
        setPaymentsYesterday(
          cashRows.filter((p) => p.payment_date === yesterday).reduce((sum, p) => sum + p.amount, 0),
        )
        setOverdueCount(scopedDues.length)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [branchId, pcfAccess, requestsAccess, role, salesAccess, stockAccess])

  const today = todayInputValue()
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = toDateInputValue(yesterdayDate)
  const todayRows = dayTotals.filter((row) => row.sale_date === today)
  const todaySales = todayRows.reduce((sum, row) => sum + row.total, 0)
  const yesterdaySales = dayTotals
    .filter((row) => row.sale_date === yesterday)
    .reduce((sum, row) => sum + row.total, 0)

  const branchFunds = branchId ? funds.filter((f) => f.branch_id === branchId) : funds
  const pettyCash = branchFunds.reduce((sum, f) => sum + Number(f.balance), 0)
  const pettyCashLow = branchFunds.some((f) => f.is_low)

  const last7 = useMemo(() => {
    const byDate = new Map(dayTotals.map((row) => [row.sale_date, row.total]))
    return Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index
      const d = new Date()
      d.setDate(d.getDate() - offset)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return {
        key,
        label: offset === 0 ? 'Today' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        total: byDate.get(key) ?? 0,
      }
    })
  }, [dayTotals])
  const weekTotal = last7.reduce((sum, day) => sum + day.total, 0)

  const varietyTotals = varietyRows
  const varietyMax = varietyTotals[0]?.[1] ?? 0

  const stockRows = (() => {
    const bySku = new Map<string, { label: string; onHand: number; reorder: number }>()
    for (const row of balances) {
      const existing = bySku.get(row.sku_id)
      if (existing) {
        existing.onHand += row.on_hand
      } else {
        bySku.set(row.sku_id, {
          label: `${row.variety_name} · ${row.sack_size}kg`,
          onHand: row.on_hand,
          reorder: row.reorder_level,
        })
      }
    }
    return [...bySku.entries()]
      .map(([key, row]) => ({
        key,
        ...row,
        status: row.onHand <= 0 ? ('out' as const) : row.onHand <= row.reorder ? ('low' as const) : ('ok' as const),
      }))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.onHand - b.onHand)
  })()

  const awaiting = (() => {
    if (!requestsAccess) return []
    let statuses = ACTIONABLE[role as string]
    if (role === 'system_admin') statuses = ['submitted', 'forwarded', 'approved']
    if (!statuses) statuses = ['submitted', 'forwarded', 'approved']
    return fundRequests
      .filter((r) => statuses.includes(r.status) && (!branchId || r.branch_id === branchId))
      .slice(0, 6)
  })()
  const awaitingTotal = awaiting.reduce((sum, r) => sum + Number(r.amount), 0)
  const awaitingSubtitle =
    awaiting.length === 0
      ? 'Nothing waiting on you'
      : [...new Set(awaiting.map((r) => REQUEST_STATUS[r.status]?.label ?? r.status))].join(' · ')

  const metricCount = (salesAccess ? 3 : 0) + (pcfAccess ? 1 : 0)
  const panels = [salesAccess, stockAccess].filter(Boolean).length

  const dateStr = new Date().toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const scopeLabel = branchId
    ? branches.find((b) => b.id === branchId)?.name ?? user!.profile.branch?.name ?? 'Branch'
    : 'All branches'

  return (
    <div className="app-page stack dash-page">
      <div className="page-header">
        <div>
          <ScopePill label={scopeLabel} />
          <h1>Dashboard</h1>
          <p>Today · {dateStr}</p>
        </div>
        {canViewAll ? (
          <ScopeSelect
            value={branchId}
            onChange={setBranchId}
            ariaLabel="Dashboard branch"
            options={[
              { value: '', label: 'All branches' },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {metricCount > 0 ? (
        <div
          className={`dash-metrics${metricCount === 3 ? ' is-three' : ''}${metricCount === 2 ? ' is-two' : ''}`}
        >
          {salesAccess ? (
            <>
              <div className="dash-metric">
                <span className="dash-metric-label">Today's sales</span>
                <strong className="dash-metric-value num">{loading ? '—' : formatPhp(todaySales)}</strong>
                <span className="dash-metric-sub">
                  {todayRows.length} sale{todayRows.length === 1 ? '' : 's'}
                  {yesterdaySales > 0 ? ` · yesterday ${compactPhp(yesterdaySales)}` : ''}
                </span>
              </div>
              <div className="dash-metric">
                <span className="dash-metric-label">Cash on hand</span>
                <strong className="dash-metric-value num">{loading ? '—' : formatPhp(paymentsToday)}</strong>
                <span className="dash-metric-sub">
                  Cash payments only
                  {paymentsYesterday > 0 ? ` · yesterday ${compactPhp(paymentsYesterday)}` : ''}
                </span>
              </div>
              <div className="dash-metric">
                <span className="dash-metric-label">Customer balances</span>
                <strong className="dash-metric-value num">{loading ? '—' : formatPhp(receivables)}</strong>
                <span className={`dash-metric-sub${overdueCount > 0 ? ' is-warning' : ''}`}>
                  {overdueCount > 0
                    ? `${overdueCount} overdue installment${overdueCount === 1 ? '' : 's'}`
                    : 'Installments, no interest'}
                </span>
              </div>
            </>
          ) : null}
          {pcfAccess ? (
            <div className={`dash-metric${pettyCashLow ? ' is-warning' : ''}`}>
              <span className="dash-metric-label">Petty cash</span>
              <strong className="dash-metric-value num">{loading ? '—' : formatPhp(pettyCash)}</strong>
              <span className={`dash-metric-sub${pettyCashLow ? ' is-warning' : ''}`}>
                {pettyCashLow ? 'Replenish soon' : 'Within threshold'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {panels > 0 ? (
        <div className={`dash-panels${panels === 1 ? ' is-single' : ''}`}>
          {salesAccess ? (
            <Card
              title="Sales by variety"
              subtitle="Last 7 days"
              action={<span className="dash-card-total num">{formatPhp(weekTotal)} total</span>}
            >
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
                      <span className="dash-bar-value num">{compactPhp(amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}

          {stockAccess ? (
            <Card
              title="Stock on hand"
              subtitle="Sacks per variety"
              action={
                <Link className="dash-card-link" to="/app/inventory">
                  View all
                </Link>
              }
            >
              {loading ? (
                <SkeletonText lines={4} />
              ) : stockRows.length === 0 ? (
                <p className="faint">No stock balances for this scope yet.</p>
              ) : (
                <ul className="dash-stock-list">
                  {stockRows.slice(0, 6).map((row) => (
                    <li className="dash-stock-row" key={row.key}>
                      <span className="dash-stock-name">{row.label}</span>
                      <span className="dash-stock-qty num">{integerFormat.format(row.onHand)}</span>
                      <span className={badgeClass(row.status === 'out' ? 'danger' : row.status === 'low' ? 'warning' : 'ok')}>
                        {row.status === 'out' ? 'Out' : row.status === 'low' ? 'Low' : 'OK'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}

      {requestsAccess ? (
        <Card
          title="Fund requests awaiting action"
          subtitle={loading ? 'Checking requests…' : awaitingSubtitle}
          action={
            <Link className="dash-card-link" to="/app/fund-requests">
              View all
            </Link>
          }
        >
          {loading ? (
            <SkeletonText lines={4} />
          ) : awaiting.length === 0 ? (
            <p className="faint">Nothing is waiting on you right now.</p>
          ) : (
            <div className="dash-requests">
              <Table>
                <thead>
                  <tr>
                    <th>Purpose</th>
                    <th className="dash-col-requester">Requester</th>
                    {!branchId ? <th className="dash-col-branch">Branch</th> : null}
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th className="dash-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {awaiting.map((request) => {
                    const status = REQUEST_STATUS[request.status]
                    return (
                      <tr key={request.id}>
                        <td className="dash-request-purpose">{request.purpose}</td>
                        <td className="dash-col-requester">{request.requester?.full_name ?? '—'}</td>
                        {!branchId ? <td className="dash-col-branch">{request.branch?.name ?? '—'}</td> : null}
                        <td className="num">{formatPhp(request.amount)}</td>
                        <td>
                          <span className={badgeClass(status?.tone ?? 'muted')}>{status?.label ?? request.status}</span>
                        </td>
                        <td className="dash-col-action">
                          <Link className="dash-row-action" to="/app/fund-requests">
                            {request.status === 'approved' ? 'Release' : 'Review'}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
              <div className="dash-requests-total">
                <span>Total</span>
                <strong className="num">{formatPhp(awaitingTotal)}</strong>
              </div>
            </div>
          )}

          {awaiting.length > 0 ? (
            <ul className="dash-requests-list">
              {awaiting.map((request) => {
                const status = REQUEST_STATUS[request.status]
                return (
                  <li key={request.id}>
                    <Link className="dash-request-card" to="/app/fund-requests">
                      <span className="dash-request-purpose">{request.purpose}</span>
                      <span className="dash-request-amount num">{formatPhp(request.amount)}</span>
                      <span className="dash-request-meta">
                        {request.requester?.full_name ?? '—'}
                        {!branchId && request.branch?.name ? ` · ${request.branch.name}` : ''}
                      </span>
                      <span className={badgeClass(status?.tone ?? 'muted')}>{status?.label ?? request.status}</span>
                    </Link>
                  </li>
                )
              })}
              <li className="dash-requests-list-total">
                <span>Total</span>
                <strong className="num">{formatPhp(awaitingTotal)}</strong>
              </li>
            </ul>
          ) : null}
        </Card>
      ) : null}

      {!salesAccess ? (
        <Card title="Welcome to JMG Staff System">
          <p className="muted" style={{ lineHeight: 1.7 }}>
            Manage your assigned tasks from the sidebar. Sales, inventory, and report metrics appear here for roles with
            access. Contact your System Admin to update your role or branch assignment.
          </p>
        </Card>
      ) : null}
    </div>
  )
}
