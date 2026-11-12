import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { Card } from '../../components/Card'
import { useAuth } from '../auth/AuthContext'
import {
  canApproveFundRequest,
  canReleaseFundRequest,
  canReviewFundRequest,
  canViewAllBranchesReports,
  canViewExpenses,
  canViewFundRequests,
  canViewPcf,
  canViewSales,
} from '../../lib/roles'
import { fetchBranches, fetchStockBalances, type StockBalanceRow } from '../inventory/inventoryApi'
import { fetchSales, type Sale } from '../sales/salesApi'
import { fetchFundBalances, type PcfFundBalance } from '../pcf/pcfApi'
import { fetchFundRequests, type FundRequest, type FundRequestStatus } from '../fund-requests/fundRequestsApi'
import { supabase } from '../../lib/supabase'
import { formatPhp } from '../../lib/money'
import { todayInputValue } from '../../lib/dates'
import type { Branch } from '../../types/database'
import './dashboard.css'

const ACTIONABLE: Record<string, FundRequestStatus[]> = {
  branch_accountant: ['submitted'],
  owner: ['forwarded'],
  general_accountant: ['approved'],
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Waiting on accounting',
  forwarded: 'Waiting on owner',
  approved: 'Ready to release',
}

function weekStartValue(): string {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

interface PaymentRow {
  amount: number
  sale: { branch_id: string } | null
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canViewAll) return
    fetchBranches().then(setBranches).catch(() => setBranches([]))
  }, [canViewAll])

  useEffect(() => {
    let cancelled = false
    const today = todayInputValue()
    const branchFilter = branchId || null

    async function load() {
      setLoading(true)
      setError('')
      try {
        const [saleRows, balanceRows, fundRows, requestRows, paymentRes] = await Promise.all([
          canViewSales(role) ? fetchSales(branchFilter) : Promise.resolve([]),
          fetchStockBalances(branchFilter),
          canViewPcf(role) ? fetchFundBalances() : Promise.resolve([]),
          canViewFundRequests(role) ? fetchFundRequests() : Promise.resolve([]),
          supabase
            .from('payments')
            .select('amount, sale:sales(branch_id)')
            .eq('payment_date', today),
        ])
        if (cancelled) return

        if (paymentRes.error) throw paymentRes.error
        const todayPayments = ((paymentRes.data as unknown as PaymentRow[]) ?? []).filter(
          (p) => !branchFilter || p.sale?.branch_id === branchFilter,
        )

        setSales(saleRows)
        setBalances(balanceRows)
        setFunds(fundRows)
        setFundRequests(requestRows)
        setPaymentsToday(todayPayments.reduce((sum, p) => sum + Number(p.amount), 0))
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
  const receivables = sales.reduce((sum, s) => sum + Number(s.balance), 0)

  const branchFunds = branchId ? funds.filter((f) => f.branch_id === branchId) : funds
  const pettyCash = branchFunds.reduce((sum, f) => sum + Number(f.balance), 0)
  const pettyCashLow = branchFunds.some((f) => f.is_low)

  const varietyTotals = (() => {
    const start = weekStartValue()
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

  const stockRows = (() => {
    if (branchId) {
      return balances.filter((b) => b.branch_id === branchId).slice(0, 6)
    }
    const bySku = new Map<string, StockBalanceRow>()
    for (const row of balances) {
      const existing = bySku.get(row.sku_id)
      if (!existing) {
        bySku.set(row.sku_id, { ...row })
      } else {
        existing.on_hand += row.on_hand
        existing.reorder_level = Math.max(existing.reorder_level, row.reorder_level)
        existing.is_low = existing.on_hand <= existing.reorder_level
      }
    }
    return [...bySku.values()].sort((a, b) => Number(b.is_low) - Number(a.is_low) || b.on_hand - a.on_hand).slice(0, 6)
  })()

  const awaiting = (() => {
    if (!canViewFundRequests(role)) return []
    let statuses = ACTIONABLE[role as string]
    if (role === 'system_admin') statuses = ['submitted', 'forwarded', 'approved']
    if (!statuses) statuses = ['submitted', 'forwarded', 'approved']
    return fundRequests
      .filter((r) => statuses.includes(r.status) && (!branchId || r.branch_id === branchId))
      .slice(0, 5)
  })()

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const greeting = (() => {
    const h = now.getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()
  const scopeLabel = branchId
    ? branches.find((b) => b.id === branchId)?.name ?? user!.profile.branch?.name ?? 'Branch'
    : 'All branches'

  return (
    <div className="app-page stack" style={{ gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.65rem', marginBottom: 4, letterSpacing: '-0.03em' }}>Dashboard</h1>
          <p className="muted">
            {greeting}, {user!.profile.full_name.split(' ')[0]} · {scopeLabel} · {dateStr}
          </p>
        </div>
        {canViewAll ? (
          <select
            className="ui-input"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Dashboard branch"
            style={{ maxWidth: 240 }}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-card-icon">🛒</div>
          <div className="metric-card-label">Today's sales</div>
          <div className="metric-card-value">{loading ? '—' : formatPhp(todaySales)}</div>
          <div className="metric-card-sub">{todayRows.length} transaction{todayRows.length !== 1 ? 's' : ''} · auto-computed</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-icon">💵</div>
          <div className="metric-card-label">Cash on hand</div>
          <div className="metric-card-value">{loading ? '—' : formatPhp(paymentsToday)}</div>
          <div className="metric-card-sub">From encoded payments today</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-icon">💰</div>
          <div className="metric-card-label">Customer balances</div>
          <div className="metric-card-value">{loading ? '—' : formatPhp(receivables)}</div>
          <div className="metric-card-sub">Installments, no interest</div>
        </div>
        {canViewPcf(role) ? (
          <div className="metric-card" style={pettyCashLow ? { borderColor: 'var(--color-warning-border)' } : {}}>
            <div className="metric-card-icon gold">🏦</div>
            <div className="metric-card-label">{branchId ? 'Petty cash (this branch)' : 'Petty cash (all funds)'}</div>
            <div className="metric-card-value" style={pettyCashLow ? { color: 'var(--color-warning)' } : {}}>
              {loading ? '—' : formatPhp(pettyCash)}
            </div>
            <div className="metric-card-sub">
              {pettyCashLow ? <Badge tone="warning">Replenish soon</Badge> : 'Within threshold'}
            </div>
          </div>
        ) : null}
      </div>

      <div className="dash-split">
        {canViewSales(role) ? (
          <Card title="Sales by variety · this week" subtitle="Revenue from encoded sales, last 7 days">
            {varietyTotals.length === 0 ? (
              <p className="faint">{loading ? 'Loading…' : 'No sales in the last 7 days for this scope.'}</p>
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
                    <span className="dash-bar-value">{formatPhp(amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        <Card title="Stock on hand" subtitle={branchId ? scopeLabel : 'All branches combined'}>
          {stockRows.length === 0 ? (
            <p className="faint">{loading ? 'Loading…' : 'No SKUs set up yet.'}</p>
          ) : (
            <div className="dash-stock-list">
              {stockRows.map((row) => (
                <div className="dash-stock-row" key={`${row.branch_id}-${row.sku_id}`}>
                  <span>
                    {row.variety_name} · {row.sack_size}kg
                  </span>
                  <span className="dash-stock-qty">
                    {row.on_hand.toLocaleString('en-PH')} sacks{' '}
                    <Badge tone={row.is_low ? 'warning' : 'muted'}>{row.is_low ? 'Low' : 'OK'}</Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {canViewFundRequests(role) ? (
        <Card
          title={ACTIONABLE[role as string]?.length ? 'Fund requests awaiting action' : 'Fund requests in progress'}
          subtitle={
            ACTIONABLE[role as string]?.length
              ? 'Waiting on your review, approval, or release'
              : 'Requests still moving through the approval flow'
          }
        >
          {awaiting.length === 0 ? (
            <p className="faint">{loading ? 'Loading…' : 'Nothing is waiting on you right now.'}</p>
          ) : (
            <div className="dash-request-list">
              {awaiting.map((request) => {
                const canRelease = canReleaseFundRequest(role) && request.status === 'approved'
                const canReview = canReviewFundRequest(role) || canApproveFundRequest(role)
                return (
                  <div className="dash-request-row" key={request.id}>
                    <div className="dash-request-main">
                      <strong>{request.purpose}</strong>
                      <span className="faint">
                        {request.category ? `${request.category} · ` : ''}
                        {request.requester?.full_name ?? 'Requester'}
                        {!branchId && request.branch?.name ? ` · ${request.branch.name}` : ''}
                      </span>
                    </div>
                    <strong className="dash-request-amount">{formatPhp(request.amount)}</strong>
                    <Badge tone={request.status === 'approved' ? 'warning' : 'muted'}>
                      {STATUS_LABELS[request.status] ?? request.status}
                    </Badge>
                    <Link to="/app/fund-requests" className="dash-request-link">
                      {canRelease ? 'Release' : canReview ? 'Review' : 'Open'}
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ) : null}

      <Card title="Quick actions">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {canViewSales(role) && <QuickLink to="/app/sales" label="🛒 New sale" brand />}
          <QuickLink to="/app/inventory" label="📦 Inventory" />
          {canViewExpenses(role) && <QuickLink to="/app/expenses" label="💳 Expenses" />}
          {canViewFundRequests(role) && <QuickLink to="/app/fund-requests" label="📋 Fund requests" />}
          <QuickLink to="/app/reports" label="📊 Reports" />
        </div>
      </Card>

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

function QuickLink({ to, label, brand = false }: { to: string; label: string; brand?: boolean }) {
  return (
    <Link to={to} className={`dash-quick-link${brand ? ' dash-quick-link-brand' : ''}`}>
      {label}
    </Link>
  )
}
