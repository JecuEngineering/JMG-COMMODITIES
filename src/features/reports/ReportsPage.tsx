import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Pagination, usePaged } from '../../components/Pagination'
import { ScopePill } from '../../components/ScopePill'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches } from '../inventory/inventoryApi'
import { formatDate, toDateInputValue, todayInputValue } from '../../lib/dates'
import { formatPhp } from '../../lib/money'
import { canViewAllBranchesReports, canViewReports } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'

interface SaleRow {
  id: string
  branch_id: string
  sale_date: string
  total: number
  amount_paid: number
  balance: number
  payment_type: string
  dr_number: string | null
  customer?: { name: string } | null
  branch?: { name: string } | null
  items?: { sku_id: string; sacks: number; price_per_sack: number; line_total: number; sku?: { variety?: { name: string } } | null }[]
}

interface ExpenseRow {
  id: string
  branch_id: string
  expense_date: string
  amount: number
  category?: { name: string } | null
  branch?: { name: string } | null
}

interface ShiftRow {
  id: string
  branch_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opening_cash: number
  expected_cash: number | null
  counted_cash: number | null
}

type TabId = 'summary' | 'sales' | 'receivables' | 'margin'

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = '\uFEFF' + toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewReports(role)
  const canViewAll = canViewAllBranchesReports(role)
  const profileBranchId = user!.profile.branch_id

  const [tab, setTab] = useState<TabId>('summary')
  const [branches, setBranches] = useState<Branch[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [branchId, setBranchId] = useState(profileBranchId ?? 'all')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toDateInputValue(d)
  })
  const [toDate, setToDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const branch = branchId === 'all' ? null : branchId

      let salesQuery = supabase
        .from('sales')
        .select(
          'id, branch_id, sale_date, total, amount_paid, balance, payment_type, dr_number, customer:customers(name), branch:branches(name), items:sale_items(sku_id, sacks, price_per_sack, line_total, sku:skus(variety:varieties(name)))',
        )
        .is('deleted_at', null)
        .eq('status', 'completed')
        .gte('sale_date', fromDate)
        .lte('sale_date', toDate)
        .order('sale_date', { ascending: false })
      if (branch) salesQuery = salesQuery.eq('branch_id', branch)

      let expenseQuery = supabase
        .from('expenses')
        .select('id, branch_id, expense_date, amount, category:expense_categories(name), branch:branches(name)')
        .is('deleted_at', null)
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate)
        .order('expense_date', { ascending: false })
      if (branch) expenseQuery = expenseQuery.eq('branch_id', branch)

      let shiftQuery = supabase
        .from('cashier_shifts')
        .select('id, branch_id, status, opened_at, closed_at, opening_cash, expected_cash, counted_cash')
        .order('opened_at', { ascending: false })
        .limit(200)
      if (branch) shiftQuery = shiftQuery.eq('branch_id', branch)

      const [b, salesRes, expRes, shiftRes] = await Promise.all([
        fetchBranches(),
        salesQuery,
        expenseQuery,
        shiftQuery,
      ])
      if (salesRes.error) throw salesRes.error
      if (expRes.error) throw expRes.error
      if (shiftRes.error) throw shiftRes.error

      setBranches(b)
      setSales((salesRes.data as unknown as SaleRow[]) ?? [])
      setExpenses((expRes.data as unknown as ExpenseRow[]) ?? [])
      setShifts((shiftRes.data as ShiftRow[]) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [branchId, fromDate, toDate])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  const totals = useMemo(() => {
    const salesTotal = sales.reduce((sum, s) => sum + Number(s.total), 0)
    const collected = sales.reduce((sum, s) => sum + Number(s.amount_paid), 0)
    const receivables = sales.reduce((sum, s) => sum + Number(s.balance), 0)
    const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
    const profit = collected - expensesTotal
    return { salesTotal, collected, receivables, expensesTotal, profit }
  }, [sales, expenses])

  const cashOnHand = useMemo(() => {
    const branch = branchId === 'all' ? null : branchId
    const openShifts = shifts.filter((s) => (branch ? s.branch_id === branch : true))
    const latest = openShifts[0]
    if (!latest) return { amount: 0, note: 'No shifts recorded' }
    if (latest.status === 'open') {
      return { amount: Number(latest.opening_cash), note: `Open since ${formatDate(latest.opened_at)}` }
    }
    return { amount: Number(latest.counted_cash ?? latest.expected_cash ?? 0), note: `Last closed ${formatDate(latest.closed_at ?? latest.opened_at)}` }
  }, [shifts, branchId])

  const marginRows = useMemo(() => {
    const map = new Map<string, { variety: string; sacks: number; revenue: number }>()
    for (const sale of sales) {
      for (const item of sale.items ?? []) {
        const name = item.sku?.variety?.name ?? 'Unknown'
        const cur = map.get(name) ?? { variety: name, sacks: 0, revenue: 0 }
        cur.sacks += Number(item.sacks)
        cur.revenue += Number(item.line_total)
        map.set(name, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  }, [sales])

  const receivableRows = useMemo(
    () => sales.filter((s) => Number(s.balance) > 0).sort((a, b) => Number(b.balance) - Number(a.balance)),
    [sales],
  )

  const salesPager = usePaged(sales, 10)
  const receivablePager = usePaged(receivableRows, 10)
  const marginPager = usePaged(marginRows, 10)

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to reports.</div>
      </div>
    )
  }

  function exportSummaryCsv() {
    const rows = [
      { Metric: 'Sales total', Value: totals.salesTotal.toFixed(2) },
      { Metric: 'Collected', Value: totals.collected.toFixed(2) },
      { Metric: 'Receivables', Value: totals.receivables.toFixed(2) },
      { Metric: 'Expenses', Value: totals.expensesTotal.toFixed(2) },
      { Metric: 'Net (collected - expenses)', Value: totals.profit.toFixed(2) },
      { Metric: 'Cash on hand', Value: cashOnHand.amount.toFixed(2) },
    ]
    downloadCsv(`summary-${fromDate}-to-${toDate}.csv`, rows)
  }

  function exportSalesCsv() {
    const rows = sales.map((s) => ({
      Date: s.sale_date,
      Branch: s.branch?.name ?? '',
      DR: s.dr_number ?? '',
      Customer: s.customer?.name ?? '',
      Type: s.payment_type,
      Total: Number(s.total).toFixed(2),
      Paid: Number(s.amount_paid).toFixed(2),
      Balance: Number(s.balance).toFixed(2),
    }))
    downloadCsv(`sales-${fromDate}-to-${toDate}.csv`, rows)
  }

  function exportReceivablesCsv() {
    const rows = receivableRows.map((s) => ({
      Date: s.sale_date,
      DR: s.dr_number ?? '',
      Customer: s.customer?.name ?? '',
      Total: Number(s.total).toFixed(2),
      Paid: Number(s.amount_paid).toFixed(2),
      Balance: Number(s.balance).toFixed(2),
    }))
    downloadCsv(`receivables-${fromDate}-to-${toDate}.csv`, rows)
  }

  function exportMarginCsv() {
    const rows = marginRows.map((m) => ({
      Variety: m.variety,
      Sacks: m.sacks,
      Revenue: m.revenue.toFixed(2),
    }))
    downloadCsv(`margin-${fromDate}-to-${toDate}.csv`, rows)
  }

  const branchOptions = canViewAll ? [{ id: 'all', name: 'All branches' } as Branch, ...branches] : branches

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <ScopePill
            label={
              branchId === 'all'
                ? 'All branches'
                : branches.find((b) => b.id === branchId)?.name ?? 'Branch'
            }
          />
          <h1>Reports</h1>
          <p>Daily sales, cash on hand, margins, receivables — export to CSV or print to PDF.</p>
        </div>
      </div>

      <Card title="Filters">
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          {canViewAll ? (
            <Field label="Branch" htmlFor="rep-branch">
              <SelectInput id="rep-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          <Field label="From" htmlFor="rep-from">
            <DateInput id="rep-from" value={fromDate} onChange={setFromDate} />
          </Field>
          <Field label="To" htmlFor="rep-to">
            <DateInput id="rep-to" value={toDate} onChange={setToDate} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button onClick={() => void load()}>Refresh</Button>
          </div>
        </div>
      </Card>

      {error ? <div className="error-banner">{error}</div> : null}

      <ChipRow>
        <Chip active={tab === 'summary'} onClick={() => setTab('summary')}>
          Summary
        </Chip>
        <Chip active={tab === 'sales'} onClick={() => setTab('sales')}>
          Sales
        </Chip>
        <Chip active={tab === 'receivables'} onClick={() => setTab('receivables')}>
          Receivables
        </Chip>
        <Chip active={tab === 'margin'} onClick={() => setTab('margin')}>
          Margin
        </Chip>
      </ChipRow>

      {loading ? <SkeletonTable rows={5} cols={4} /> : null}

      {tab === 'summary' ? (
        <div className="stack">
          <Card title="Summary">
            <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p className="muted">Sales total</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(totals.salesTotal)}</strong>
            </div>
            <div>
              <p className="muted">Collected</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(totals.collected)}</strong>
            </div>
            <div>
              <p className="muted">Receivables</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(totals.receivables)}</strong>
            </div>
            <div>
              <p className="muted">Expenses</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(totals.expensesTotal)}</strong>
            </div>
            <div>
              <p className="muted">Net (collected − expenses)</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(totals.profit)}</strong>
            </div>
            <div>
              <p className="muted">Cash on hand</p>
              <strong style={{ fontSize: 22 }}>{formatPhp(cashOnHand.amount)}</strong>
              <p className="faint">{cashOnHand.note}</p>
            </div>
            </div>
          </Card>

          <div className="no-print row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={exportSummaryCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'sales' ? (
        <div className="stack">
          <Card title={`Sales (${sales.length})`}>
            {sales.length === 0 ? (
              <div className="empty-state">No sales in this range.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Branch</th>
                    <th>DR</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPager.pageItems.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDate(s.sale_date)}</td>
                      <td>{s.branch?.name ?? '—'}</td>
                      <td>{s.dr_number ?? '—'}</td>
                      <td>{s.customer?.name ?? '—'}</td>
                      <td>{s.payment_type}</td>
                      <td>{formatPhp(s.total)}</td>
                      <td>{formatPhp(s.amount_paid)}</td>
                      <td>{formatPhp(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={salesPager.page}
              pageCount={salesPager.pageCount}
              pageSize={salesPager.pageSize}
              total={salesPager.total}
              start={salesPager.start}
              end={salesPager.end}
              onPage={salesPager.setPage}
              onPageSize={salesPager.setPageSize}
              noun="sale"
            />
          </Card>
          <div className="no-print row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={exportSalesCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'receivables' ? (
        <div className="stack">
          <Card title={`Receivables (${receivableRows.length})`}>
            {receivableRows.length === 0 ? (
              <div className="empty-state">No outstanding balances.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>DR</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {receivablePager.pageItems.map((s) => (
                    <tr key={s.id}>
                      <td>{formatDate(s.sale_date)}</td>
                      <td>{s.dr_number ?? '—'}</td>
                      <td>{s.customer?.name ?? '—'}</td>
                      <td>{formatPhp(s.total)}</td>
                      <td>{formatPhp(s.amount_paid)}</td>
                      <td>{formatPhp(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={receivablePager.page}
              pageCount={receivablePager.pageCount}
              pageSize={receivablePager.pageSize}
              total={receivablePager.total}
              start={receivablePager.start}
              end={receivablePager.end}
              onPage={receivablePager.setPage}
              onPageSize={receivablePager.setPageSize}
              noun="receivable"
            />
          </Card>
          <div className="no-print row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={exportReceivablesCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'margin' ? (
        <div className="stack">
          <Card title="Revenue per variety" subtitle="Cost per sack comes from containers; margin shown once landed cost is available">
            {marginRows.length === 0 ? (
              <div className="empty-state">No sales in this range.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Variety</th>
                    <th>Sacks sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {marginPager.pageItems.map((m) => (
                    <tr key={m.variety}>
                      <td>{m.variety}</td>
                      <td>{m.sacks}</td>
                      <td>{formatPhp(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={marginPager.page}
              pageCount={marginPager.pageCount}
              pageSize={marginPager.pageSize}
              total={marginPager.total}
              start={marginPager.start}
              end={marginPager.end}
              onPage={marginPager.setPage}
              onPageSize={marginPager.setPageSize}
              noun="variety"
            />
          </Card>
          <div className="no-print row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={exportMarginCsv}>
              Export CSV
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
