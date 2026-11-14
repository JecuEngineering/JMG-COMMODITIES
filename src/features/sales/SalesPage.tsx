import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches, fetchSkus, skuLabel } from '../inventory/inventoryApi'
import { useCompanySettings } from '../settings/useCompanySettings'
import { formatDate, formatDateTime, toDateInputValue, todayInputValue } from '../../lib/dates'
import { downloadExcel } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { canCreateSales, canViewAllBranchesSales, canViewSales } from '../../lib/roles'
import type { Branch, Sku, Variety } from '../../types/database'
import {
  collectPayment,
  createCustomer,
  createSale,
  closeShift,
  fetchCurrentPrice,
  fetchAvailableStock,
  fetchCustomers,
  fetchOpenShift,
  fetchOverdueDues,
  fetchSale,
  fetchSales,
  openShift,
  type CashierShift,
  type Customer,
  type InstallmentDue,
  type PaymentMethod,
  type Sale,
} from './salesApi'
import './sales.css'

type TabId = 'sales' | 'overdue' | 'shifts' | 'receipt'

function addDaysInput(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

function formatQty(value: number): string {
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

function paymentInfo(sale: Sale) {
  const payments = sale.payments ?? []
  const methods = new Set(payments.map((p) => p.method))
  if (payments.length === 0) methods.add(sale.payment_type)
  const reference = payments.find((p) => p.reference_no)?.reference_no ?? ''
  return {
    date: payments[0]?.payment_date ?? '',
    reference,
    check: methods.has('check'),
    cash: methods.has('cash'),
    gcash: methods.has('gcash'),
    bank: methods.has('bank'),
  }
}

export function SalesPage() {
  const { user } = useAuth()
  const { settings } = useCompanySettings()
  const role = user!.profile.role
  const canView = canViewSales(role)
  const canCreate = canCreateSales(role)
  const canViewAll = canViewAllBranchesSales(role)
  const profileBranchId = user!.profile.branch_id

  const [tab, setTab] = useState<TabId>('sales')
  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [overdue, setOverdue] = useState<InstallmentDue[]>([])
  const [shift, setShift] = useState<CashierShift | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)

  const [branchId, setBranchId] = useState(profileBranchId ?? '')
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [varietyId, setVarietyId] = useState('')
  const [sackSize, setSackSize] = useState<5 | 25 | 50>(25)
  const [sacks, setSacks] = useState('20')
  const [price, setPrice] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentMethod>('cash')
  const [splitPayment, setSplitPayment] = useState(false)
  const [splitGcash, setSplitGcash] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [parts, setParts] = useState('3')
  const [firstDueDate, setFirstDueDate] = useState(() => addDaysInput(todayInputValue(), 30))
  const [orNumber, setOrNumber] = useState('')
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [salesQuery, setSalesQuery] = useState('')
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [availableStock, setAvailableStock] = useState<number | null>(null)

  const [paySaleId, setPaySaleId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [openingCash, setOpeningCash] = useState('0')
  const [countedCash, setCountedCash] = useState('')

  const varieties = useMemo(() => {
    const map = new Map<string, Variety>()
    for (const s of skus) {
      if (s.variety) map.set(s.variety.id, s.variety)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [skus])

  const selectedSku = useMemo(
    () => skus.find((s) => s.variety_id === varietyId && s.sack_size === sackSize) ?? null,
    [skus, varietyId, sackSize],
  )

  const total = useMemo(() => {
    const q = Number(sacks) || 0
    const p = Number(price) || 0
    return Math.round(q * p * 100) / 100
  }, [sacks, price])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const b = await fetchBranches()
      const s = await fetchSkus()
      const defaultBranch = profileBranchId || b[0]?.id || ''
      setBranches(b)
      setSkus(s)
      setBranchId((prev) => prev || defaultBranch)
      if (s[0]?.variety_id) setVarietyId((prev) => prev || s[0].variety_id)

      const branch = profileBranchId || defaultBranch
      const [saleRows, dues, open] = await Promise.all([
        fetchSales(canViewAll ? null : branch),
        fetchOverdueDues(),
        user ? fetchOpenShift(user.id, branch) : Promise.resolve(null),
      ])
      setSales(saleRows)
      setOverdue(dues)
      setShift(open)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setFirstLoad(false)
    }
  }, [profileBranchId, role, user])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  useEffect(() => {
    if (!selectedSku) {
      setPrice('')
      return
    }
    void fetchCurrentPrice(selectedSku.id).then((p) => {
      if (p != null) setPrice(String(p))
    })
  }, [selectedSku])

  useEffect(() => {
    if (!canView || !branchId) return
    let cancelled = false
    void fetchCustomers(branchId)
      .then((rows) => {
        if (cancelled) return
        setCustomers(rows)
        setCustomerId((prev) => (rows.some((c) => c.id === prev) ? prev : rows[0]?.id ?? ''))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [branchId, canView])

  useEffect(() => {
    if (!selectedSku || !branchId) {
      setAvailableStock(null)
      return
    }
    let cancelled = false
    setAvailableStock(null)
    void fetchAvailableStock(branchId, selectedSku.id)
      .then((onHand) => {
        if (!cancelled) setAvailableStock(onHand)
      })
      .catch(() => {
        if (!cancelled) setAvailableStock(null)
      })
    return () => {
      cancelled = true
    }
  }, [branchId, selectedSku])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.id === customerId ||
        c.name.toLowerCase().includes(q) ||
        (c.contact ?? '').toLowerCase().includes(q),
    )
  }, [customers, customerId, customerQuery])

  const installmentPreview = useMemo(() => {
    if (paymentType !== 'installment') return null
    const down = Math.max(0, Number(downPayment) || 0)
    const partCount = Number(parts) || 0
    const financed = Math.round((total - down) * 100) / 100
    if (!Number.isInteger(partCount) || partCount < 1 || financed <= 0) return null
    const first = Math.floor((financed / partCount) * 100) / 100
    let allocated = 0
    const rows = Array.from({ length: Math.min(partCount, 60) }, (_, index) => {
      const sequence = index + 1
      const amount =
        sequence === partCount ? Math.round((financed - allocated) * 100) / 100 : first
      allocated = Math.round((allocated + amount) * 100) / 100
      return {
        sequence,
        dueDate: firstDueDate ? addDaysInput(firstDueDate, index * 30) : '',
        amount,
      }
    })
    return { down, financed, partCount, rows }
  }, [paymentType, downPayment, parts, total, firstDueDate])

  const filteredSales = useMemo(() => {
    const q = salesQuery.trim().toLowerCase()
    return sales.filter((s) => {
      if (historyFrom && s.sale_date < historyFrom) return false
      if (historyTo && s.sale_date > historyTo) return false
      if (!q) return true
      return (
        (s.customer?.name ?? '').toLowerCase().includes(q) ||
        (s.dr_number ?? '').toLowerCase().includes(q) ||
        (s.or_number ?? '').toLowerCase().includes(q)
      )
    })
  }, [sales, salesQuery, historyFrom, historyTo])

  const historyTotals = useMemo(() => {
    let gross = 0
    let paid = 0
    let balance = 0
    for (const s of filteredSales) {
      gross += Number(s.total)
      paid += Number(s.amount_paid)
      balance += Number(s.balance)
    }
    return { gross, paid, balance }
  }, [filteredSales])

  // Sales-In ledger order: newest day first, then the order the day was recorded.
  const ledgerSales = useMemo(() => {
    return [...filteredSales].sort((a, b) => {
      const byDate = b.sale_date.localeCompare(a.sale_date)
      if (byDate !== 0) return byDate
      return (a.dr_number ?? '').localeCompare(b.dr_number ?? '')
    })
  }, [filteredSales])

  const historyBags = useMemo(
    () =>
      ledgerSales.reduce(
        (sum, sale) => sum + (sale.items ?? []).reduce((n, item) => n + Number(item.sacks), 0),
        0,
      ),
    [ledgerSales],
  )

  // Payment method totals let a day's cash be checked against the sheet's CASH ON HAND.
  const paymentTotals = useMemo(() => {
    const totals = { cash: 0, gcash: 0, check: 0, bank: 0 }
    for (const sale of ledgerSales) {
      for (const p of sale.payments ?? []) {
        if (p.method === 'cash' || p.method === 'gcash' || p.method === 'check' || p.method === 'bank') {
          totals[p.method] += Number(p.amount)
        }
      }
    }
    return totals
  }, [ledgerSales])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to sales.</div>
      </div>
    )
  }

  async function onAddCustomer() {
    if (!newCustomerName.trim() || !canCreate) return
    try {
      const c = await createCustomer({ name: newCustomerName.trim(), branch_id: branchId })
      setCustomers((prev) => [...prev, c])
      setCustomerId(c.id)
      setNewCustomerName('')
      setMessage(`Customer ${c.name} added.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function describeSaleError(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e)
    const branchName = branches.find((b) => b.id === branchId)?.name ?? 'this branch'
    const match = raw.match(/Insufficient stock for SKU ([0-9a-f-]{36})/i)
    if (match) {
      const label = selectedSku ? skuLabel(selectedSku) : `SKU ${match[1].slice(0, 8)}`
      const onHand = availableStock != null ? `${availableStock} sack(s)` : 'no stock recorded'
      return `Not enough stock for ${label} at ${branchName} — ${onHand} on hand, ${sacks} requested. Receive stock via Containers or Inventory before selling.`
    }
    if (/No access to this branch/i.test(raw)) {
      return `You cannot sell for ${branchName}. Select a branch assigned to you.`
    }
    if (/Not allowed to create sales/i.test(raw)) {
      return 'Your role is not allowed to create sales.'
    }
    return raw
  }

  async function onSaveSale(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || !selectedSku || !customerId) return
    setError(null)
    setMessage(null)
    const qty = Number(sacks)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a number of sacks greater than zero.')
      return
    }
    const gcashPart = Number(splitGcash || 0)
    if (splitPayment && (!Number.isFinite(gcashPart) || gcashPart <= 0 || gcashPart >= total)) {
      setError('Enter a GCash amount above zero and below the sale total.')
      return
    }
    const installmentParts = Number(parts || 1)
    const down = Number(downPayment || 0)
    if (paymentType === 'installment') {
      if (!Number.isInteger(installmentParts) || installmentParts < 1) {
        setError('Enter a whole number of installment parts (1 or more).')
        return
      }
      if (!Number.isFinite(down) || down < 0) {
        setError('Enter a valid down payment (0 or more).')
        return
      }
      if (down > total) {
        setError(`Down payment cannot be more than the sale total (${formatPhp(total)}).`)
        return
      }
      if (!firstDueDate) {
        setError('Pick the first installment due date.')
        return
      }
    }
    let onHand = availableStock
    try {
      onHand = await fetchAvailableStock(branchId, selectedSku.id)
      setAvailableStock(onHand)
    } catch {
      // Fall back to the RPC's own stock check.
    }
    if (onHand != null && qty > onHand) {
      const branchName = branches.find((b) => b.id === branchId)?.name ?? 'this branch'
      setError(
        `Not enough stock for ${skuLabel(selectedSku)} at ${branchName} — ${onHand} sack(s) on hand, ${qty} requested. Receive stock first.`,
      )
      return
    }
    try {
      const id = await createSale({
        branchId,
        customerId,
        paymentType,
        items: [
          {
            sku_id: selectedSku.id,
            sacks: Number(sacks),
            price_per_sack: Number(price),
          },
        ],
        orNumber: orNumber || undefined,
        downPayment: paymentType === 'installment' ? Number(downPayment || 0) : undefined,
        installmentParts: paymentType === 'installment' ? Number(parts || 1) : undefined,
        firstDueDate: paymentType === 'installment' ? firstDueDate : undefined,
        payments:
          splitPayment && paymentType !== 'installment'
            ? [
                { method: 'gcash', amount: Math.round(gcashPart * 100) / 100 },
                { method: 'cash', amount: Math.round((total - gcashPart) * 100) / 100 },
              ]
            : undefined,
      })
      const sale = await fetchSale(id)
      setReceiptSale(sale)
      setMessage(`Sale saved · DR ${sale?.dr_number ?? ''}. Stock deducted.`)
      setNewSaleOpen(false)
      setTab('receipt')
      setSacks('20')
      setOrNumber('')
      setDownPayment('')
      setSplitGcash('')
      setSplitPayment(false)
      await load()
    } catch (e) {
      setError(describeSaleError(e))
    }
  }

  async function onCollect(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || !paySaleId) return
    const amt = Number(payAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a payment amount greater than zero.')
      return
    }
    setError(null)
    try {
      await collectPayment({
        saleId: paySaleId,
        amount: amt,
        method: payMethod === 'installment' ? 'cash' : payMethod,
      })
      setMessage('Payment collected. Balance updated.')
      setPayAmount('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onOpenShift() {
    try {
      await openShift(branchId, Number(openingCash || 0))
      setMessage('Shift opened.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCloseShift() {
    if (!shift) return
    try {
      await closeShift(shift.id, Number(countedCash || 0))
      setMessage('Shift closed.')
      setCountedCash('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function printReceipt() {
    window.print()
  }

  function exportSalesHistory() {
    const rows: (string | number | null)[][] = []
    for (const sale of ledgerSales) {
      const pay = paymentInfo(sale)
      const items = sale.items?.length ? sale.items : [null]
      items.forEach((item, index) => {
        rows.push([
          index === 0 ? sale.sale_date : '',
          index === 0 ? sale.or_number ?? '' : '',
          index === 0 ? sale.customer?.name ?? '' : '',
          item ? item.source_description || (item.sku ? skuLabel(item.sku) : '') : '',
          item ? Number(item.sacks) : '',
          item ? Number(item.price_per_sack) : '',
          item ? Number(item.line_total) : '',
          index === 0 ? pay.date : '',
          index === 0 ? pay.reference || (pay.bank ? 'Bank transfer' : '') : '',
          index === 0 && pay.check ? '✓' : '',
          index === 0 && pay.cash ? '✓' : '',
          index === 0 && pay.gcash ? '✓' : '',
        ])
      })
    }
    rows.push(['TOTAL', '', '', '', historyBags, '', historyTotals.gross, '', '', '', '', ''])
    rows.push(['', '', 'CASH', '', '', '', paymentTotals.cash, '', '', '', '✓', ''])
    rows.push(['', '', 'GCASH', '', '', '', paymentTotals.gcash, '', '', '', '', '✓'])
    if (paymentTotals.check > 0) {
      rows.push(['', '', 'CHECK', '', '', '', paymentTotals.check, '', '', '✓', '', ''])
    }
    if (paymentTotals.bank > 0) {
      rows.push(['', '', 'BANK', '', '', '', paymentTotals.bank, '', '✓', '', '', ''])
    }
    downloadExcel(
      `sales-in-${todayInputValue()}.xls`,
      'Sales-In',
      ['DATE', 'INVOICE NO.', 'NAME', 'DESCRIPTION', 'BAGS', 'PRICE', 'AMOUNT', 'DATE DEPOSIT', 'BANK', 'CHEQUE', 'CASH', 'GCASH'],
      rows,
    )
  }

  const branchOptions = canViewAll ? branches : branches.filter((b) => b.id === profileBranchId)

  const newSaleAside = (
    <div className="stack sale-aside">
      <div>
        <label className="field-label">Payment *</label>
        <ChipRow>
          <Chip
            active={!splitPayment && paymentType === 'cash'}
            onClick={() => {
              setSplitPayment(false)
              setPaymentType('cash')
            }}
          >
            Cash
          </Chip>
          <Chip
            active={splitPayment}
            onClick={() => {
              setSplitPayment(true)
              setPaymentType('cash')
            }}
          >
            Cash + GCash
          </Chip>
          <Chip
            active={!splitPayment && paymentType === 'gcash'}
            onClick={() => {
              setSplitPayment(false)
              setPaymentType('gcash')
            }}
          >
            GCash
          </Chip>
          <Chip
            active={paymentType === 'installment'}
            onClick={() => {
              setSplitPayment(false)
              setPaymentType('installment')
            }}
          >
            Installment
          </Chip>
        </ChipRow>
        {paymentType === 'installment' ? (
          <p className="faint" style={{ marginTop: 6 }}>
            Pay in parts · no interest · balance tracked
          </p>
        ) : null}
        {splitPayment ? (
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            <Field label="GCash amount (₱)" htmlFor="split-gcash">
              <TextInput
                id="split-gcash"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={splitGcash}
                onChange={(e) => setSplitGcash(e.target.value)}
              />
            </Field>
            <p className="faint">
              Cash gets {formatPhp(Math.max(0, total - (Number(splitGcash) || 0)))} of {formatPhp(total)}.
            </p>
          </div>
        ) : null}
      </div>

      {paymentType === 'installment' ? (
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 130px' }}>
              <Field label="Down payment (₱)" htmlFor="down">
                <TextInput
                  id="down"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  form="new-sale-form"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: '1 1 90px' }}>
              <Field label="Parts" htmlFor="parts">
                <TextInput
                  id="parts"
                  type="number"
                  min="1"
                  step="1"
                  form="new-sale-form"
                  value={parts}
                  onChange={(e) => setParts(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <Field label="First due date" htmlFor="first-due">
            <TextInput
              id="first-due"
              type="date"
              form="new-sale-form"
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
            />
          </Field>
          {installmentPreview ? (
            <div className="stack" style={{ gap: 6 }}>
              <p className="faint">
                {formatPhp(installmentPreview.financed)} over {installmentPreview.partCount} part(s) · 0%
                interest
              </p>
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {installmentPreview.rows.map((row) => (
                    <tr key={row.sequence}>
                      <td>{row.sequence}</td>
                      <td>{row.dueDate ? formatDate(row.dueDate) : '—'}</td>
                      <td>{formatPhp(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {installmentPreview.partCount > installmentPreview.rows.length ? (
                <p className="faint">
                  Showing the first {installmentPreview.rows.length} of {installmentPreview.partCount} parts.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="faint">Set a down payment below the total to preview the schedule.</p>
          )}
        </div>
      ) : null}

      <div className="sale-summary">
        <div className="sale-summary-row">
          <span className="muted">
            {sacks || 0} sack(s) × {formatPhp(Number(price || 0))}
          </span>
          <span>{formatPhp(total)}</span>
        </div>
        {paymentType === 'installment' ? (
          <>
            <div className="sale-summary-row">
              <span className="muted">Down payment</span>
              <span>{formatPhp(Number(downPayment || 0))}</span>
            </div>
            <div className="sale-summary-row">
              <span className="muted">Balance</span>
              <span>{formatPhp(installmentPreview?.financed ?? Math.max(0, total - Number(downPayment || 0)))}</span>
            </div>
          </>
        ) : null}
        {splitPayment ? (
          <>
            <div className="sale-summary-row">
              <span className="muted">GCash</span>
              <span>{formatPhp(Number(splitGcash || 0))}</span>
            </div>
            <div className="sale-summary-row">
              <span className="muted">Cash</span>
              <span>{formatPhp(Math.max(0, total - (Number(splitGcash) || 0)))}</span>
            </div>
          </>
        ) : null}
        <div className="sale-total-bar">
          <span className="muted">Total</span>
          <strong>{formatPhp(total)}</strong>
        </div>
      </div>
    </div>
  )

  return (
    <div className="app-page stack sales-page">
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p>
            {branches.find((b) => b.id === branchId)?.name ?? 'Branch'} · new sales, history, installments
            and shifts
          </p>
        </div>
        {canCreate ? <Button onClick={() => setNewSaleOpen(true)}>New sale</Button> : null}
      </div>

      <ChipRow>
        <Chip active={tab === 'sales'} onClick={() => setTab('sales')}>
          Sales
        </Chip>
        <Chip active={tab === 'overdue'} onClick={() => setTab('overdue')}>
          Overdue
        </Chip>
        <Chip active={tab === 'shifts'} onClick={() => setTab('shifts')}>
          Shifts
        </Chip>
        <Chip active={tab === 'receipt'} onClick={() => setTab('receipt')}>
          DR
        </Chip>
      </ChipRow>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {loading && firstLoad ? <SkeletonTable rows={5} cols={5} /> : null}

      <Modal
        open={newSaleOpen && canCreate}
        onClose={() => setNewSaleOpen(false)}
        title="New sale"
        subtitle={`${branches.find((b) => b.id === branchId)?.name ?? 'Branch'} · stock is deducted when you save`}
        size="lg"
        aside={newSaleAside}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewSaleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-sale-form" disabled={!selectedSku || !customerId}>
              Save sale & print DR
            </Button>
          </>
        }
      >
          <form id="new-sale-form" className="stack" onSubmit={onSaveSale}>
            {canViewAll && (
              <Field label="Branch" htmlFor="sale-branch">
                <SelectInput id="sale-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            )}

            <Field label="Find customer" htmlFor="sale-customer-filter">
              <TextInput
                id="sale-customer-filter"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Search name or contact"
              />
            </Field>

            <Field label="Customer" htmlFor="sale-customer">
              <SelectInput
                id="sale-customer"
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {filteredCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.contact ? ` · ${c.contact}` : ''}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {customerQuery && filteredCustomers.length === 0 ? (
              <p className="faint">No customer matches “{customerQuery}”. Use Quick add below.</p>
            ) : null}

            {canCreate ? (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Quick add customer" htmlFor="new-cust">
                    <TextInput
                      id="new-cust"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </Field>
                </div>
                <Button type="button" variant="secondary" onClick={() => void onAddCustomer()}>
                  Add
                </Button>
              </div>
            ) : null}

            <div>
              <label className="field-label">Rice variety</label>
              <ChipRow>
                {varieties.map((v) => (
                  <Chip key={v.id} active={varietyId === v.id} onClick={() => setVarietyId(v.id)}>
                    {v.name}
                  </Chip>
                ))}
              </ChipRow>
            </div>

            <div>
              <label className="field-label">Sack size</label>
              <ChipRow>
                {([5, 25, 50] as const).map((size) => (
                  <Chip key={size} active={sackSize === size} onClick={() => setSackSize(size)}>
                    {size} kg
                  </Chip>
                ))}
              </ChipRow>
            </div>

            <Field label="Sacks" htmlFor="sale-sacks">
              <TextInput
                id="sale-sacks"
                required
                inputMode="decimal"
                value={sacks}
                onChange={(e) => setSacks(e.target.value)}
              />
            </Field>

            <Field label="Price per sack (₱)" htmlFor="sale-price">
              <TextInput
                id="sale-price"
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>

            {selectedSku ? (
              <p
                className="faint"
                style={{
                  marginTop: -6,
                  color: availableStock === 0 ? 'var(--color-danger)' : undefined,
                  fontWeight: availableStock === 0 ? 600 : undefined,
                }}
              >
                {availableStock == null ? (
                  <span className="hint-loading">
                    <span className="sk-spinner" aria-hidden="true" />
                    Checking stock
                  </span>
                ) : (
                  `Available at ${branches.find((b) => b.id === branchId)?.name ?? 'branch'}: ${availableStock} sack(s)`
                )}
              </p>
            ) : null}

            <Field label="Official Receipt # (optional)" htmlFor="or">
              <TextInput id="or" value={orNumber} onChange={(e) => setOrNumber(e.target.value)} />
            </Field>

            {!selectedSku ? <p className="error-banner">No SKU for this variety + sack size.</p> : null}
          </form>
      </Modal>

      {tab === 'sales' ? (
        <div className="stack">
          <Card title="Collect installment payment">
            <form className="stack" onSubmit={onCollect}>
              <Field label="Sale with balance" htmlFor="pay-sale">
                <SelectInput id="pay-sale" required value={paySaleId} onChange={(e) => setPaySaleId(e.target.value)}>
                  <option value="">Select</option>
                  {sales
                    .filter((s) => Number(s.balance) > 0)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.dr_number} · {s.customer?.name} · bal {formatPhp(s.balance)}
                      </option>
                    ))}
                </SelectInput>
              </Field>
              <Field label="Amount" htmlFor="pay-amt">
                <TextInput id="pay-amt" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Method" htmlFor="pay-method">
                <SelectInput
                  id="pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank</option>
                  <option value="check">Check</option>
                </SelectInput>
              </Field>
              {canCreate ? <Button type="submit">Collect payment</Button> : null}
            </form>
          </Card>

          <Card
            title="Sales history"
            subtitle={`${ledgerSales.length} of ${sales.length} sale(s) · ${formatQty(historyBags)} bag(s)`}
            action={
              ledgerSales.length > 0 ? (
                <Button variant="secondary" onClick={exportSalesHistory}>
                  Export Excel
                </Button>
              ) : undefined
            }
          >
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 150px' }}>
                <Field label="From" htmlFor="sales-from">
                  <TextInput
                    id="sales-from"
                    type="date"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                  />
                </Field>
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <Field label="To" htmlFor="sales-to">
                  <TextInput
                    id="sales-to"
                    type="date"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                  />
                </Field>
              </div>
              <div style={{ flex: '2 1 220px' }}>
                <Field label="Search" htmlFor="sales-filter">
                  <TextInput
                    id="sales-filter"
                    value={salesQuery}
                    onChange={(e) => setSalesQuery(e.target.value)}
                    placeholder="Customer, DR or OR number"
                  />
                </Field>
              </div>
            </div>
            <p className="muted" style={{ margin: '4px 0 4px' }}>
              Gross {formatPhp(historyTotals.gross)} · Collected {formatPhp(historyTotals.paid)} · Balance{' '}
              {formatPhp(historyTotals.balance)}
            </p>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              Cash {formatPhp(paymentTotals.cash)} · GCash {formatPhp(paymentTotals.gcash)}
              {paymentTotals.check > 0 ? ` · Check ${formatPhp(paymentTotals.check)}` : ''}
              {paymentTotals.bank > 0 ? ` · Bank ${formatPhp(paymentTotals.bank)}` : ''}
            </p>
            {ledgerSales.length === 0 ? (
              <div className="empty-state">No sales for this filter.</div>
            ) : (
              <div className="sales-ledger">
                <Table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice no.</th>
                      <th>Name</th>
                      <th>Description</th>
                      <th className="num">Bags</th>
                      <th className="num">Price</th>
                      <th className="num">Amount</th>
                      <th>Date deposit</th>
                      <th>Bank</th>
                      <th className="center">Cheque</th>
                      <th className="center">Cash</th>
                      <th className="center">GCash</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerSales.map((sale) => {
                      const pay = paymentInfo(sale)
                      const items = sale.items?.length ? sale.items : [null]
                      return items.map((item, index) => (
                        <tr
                          key={`${sale.id}-${item?.id ?? 'none'}`}
                          className={index === 0 ? 'ledger-start' : undefined}
                        >
                          <td>{index === 0 ? formatDate(sale.sale_date) : ''}</td>
                          <td>{index === 0 ? sale.or_number ?? '' : ''}</td>
                          <td>{index === 0 ? sale.customer?.name ?? '—' : ''}</td>
                          <td>
                            {item
                              ? item.source_description || (item.sku ? skuLabel(item.sku) : item.sku_id)
                              : ''}
                          </td>
                          <td className="num">{item ? formatQty(Number(item.sacks)) : ''}</td>
                          <td className="num">{item ? formatPhp(item.price_per_sack) : ''}</td>
                          <td className="num">{item ? formatPhp(item.line_total) : ''}</td>
                          <td>{index === 0 && pay.date ? formatDate(pay.date) : ''}</td>
                          <td>{index === 0 ? pay.reference || (pay.bank ? 'Bank transfer' : '') : ''}</td>
                          <td className="center">{index === 0 && pay.check ? '✓' : ''}</td>
                          <td className="center">{index === 0 && pay.cash ? '✓' : ''}</td>
                          <td className="center">{index === 0 && pay.gcash ? '✓' : ''}</td>
                          <td>
                            {index === 0 ? (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setReceiptSale(sale)
                                  setTab('receipt')
                                }}
                              >
                                DR
                              </Button>
                            ) : (
                              ''
                            )}
                          </td>
                        </tr>
                      ))
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        <strong>TOTAL</strong>
                      </td>
                      <td className="num">
                        <strong>{formatQty(historyBags)}</strong>
                      </td>
                      <td />
                      <td className="num">
                        <strong>{formatPhp(historyTotals.gross)}</strong>
                      </td>
                      <td colSpan={6} />
                    </tr>
                  </tfoot>
                </Table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'overdue' ? (
        <Card title="Overdue installments" subtitle="No interest · no penalty — balance only">
          {overdue.length === 0 ? (
            <div className="empty-state">No overdue dues.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Customer</th>
                  <th>Amount due</th>
                  <th>Paid</th>
                  <th>Left</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((d) => {
                  const sale = d.plan?.sale
                  const left = Number(d.amount) - Number(d.paid_amount)
                  return (
                    <tr key={d.id}>
                      <td>{formatDate(d.due_date)}</td>
                      <td>{sale?.customer?.name ?? '—'}</td>
                      <td>{formatPhp(d.amount)}</td>
                      <td>{formatPhp(d.paid_amount)}</td>
                      <td>{formatPhp(left)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {tab === 'shifts' ? (
        <Card title="Cashier shift">
          {shift ? (
            <div className="stack">
              <p>
                Open since {formatDateTime(shift.opened_at)} · opening cash {formatPhp(shift.opening_cash)}
              </p>
              <Field label="Counted cash on close" htmlFor="counted">
                <TextInput id="counted" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              </Field>
              {canCreate ? <Button onClick={() => void onCloseShift()}>Close shift</Button> : null}
            </div>
          ) : (
            <div className="stack">
              <Field label="Opening cash" htmlFor="opening">
                <TextInput id="opening" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
              </Field>
              {canCreate ? <Button onClick={() => void onOpenShift()}>Open shift</Button> : null}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'receipt' ? (
        <div className="stack">
          <div className="no-print row">
            <Button onClick={printReceipt} disabled={!receiptSale}>
              Print Delivery Receipt
            </Button>
          </div>
          {receiptSale ? (
            <div className="dr-sheet">
              <header className="dr-header">
                {settings?.logo_url ? <img src={settings.logo_url} alt="" className="dr-logo" /> : null}
                <div>
                  <h2>{settings?.name ?? 'JMG Commodities Inc.'}</h2>
                  <p>{settings?.address}</p>
                  <p>TIN: {settings?.tin ?? '—'}</p>
                </div>
                <div className="dr-meta">
                  <strong>DELIVERY RECEIPT</strong>
                  <div>{receiptSale.dr_number}</div>
                  <div>{formatDate(receiptSale.sale_date)}</div>
                </div>
              </header>
              <p>
                Customer: <strong>{receiptSale.customer?.name}</strong>
              </p>
              <p>OR number: {receiptSale.or_number || '—'}</p>
              <table className="dr-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Sacks</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptSale.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.source_description || (item.sku ? skuLabel(item.sku) : item.sku_id)}</td>
                      <td>{item.sacks}</td>
                      <td>{formatPhp(item.price_per_sack)}</td>
                      <td>{formatPhp(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dr-total">
                Total <strong>{formatPhp(receiptSale.total)}</strong>
              </p>
              <p>
                Paid {formatPhp(receiptSale.amount_paid)} · Balance {formatPhp(receiptSale.balance)}
              </p>
              <p className="faint">Payment: {receiptSale.payment_type}</p>
            </div>
          ) : (
            <div className="empty-state">Save a sale to generate a Delivery Receipt.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
