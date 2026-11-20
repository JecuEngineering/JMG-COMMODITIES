import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { ScopePill } from '../../components/ScopePill'
import { Chip, ChipRow } from '../../components/Chip'
import { Combobox } from '../../components/Combobox'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
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

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bank: 'Bank transfer',
  check: 'Check',
  installment: 'Installment',
}

function addDaysInput(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

function formatQty(value: number): string {
  return Number(value).toLocaleString('en-PH', { maximumFractionDigits: 3 })
}

interface SaleCartLine {
  id: string
  skuId: string
  label: string
  sacks: number
  pricePerSack: number
  lineTotal: number
}

let cartLineSeq = 0
function nextCartLineId() {
  cartLineSeq += 1
  return `sale-line-${cartLineSeq}`
}

function paymentInfo(sale: Sale) {
  const payments = sale.payments ?? []
  const methods = new Set(payments.map((p) => p.method))
  if (payments.length === 0) methods.add(sale.payment_type)
  return {
    check: methods.has('check'),
    cash: methods.has('cash'),
    gcash: methods.has('gcash'),
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
  const [payOpen, setPayOpen] = useState(false)
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
  const [cart, setCart] = useState<SaleCartLine[]>([])
  const [paymentType, setPaymentType] = useState<PaymentMethod>('cash')
  const [splitPayment, setSplitPayment] = useState(false)
  const [splitGcash, setSplitGcash] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [parts, setParts] = useState('3')
  const [firstDueDate, setFirstDueDate] = useState(() => addDaysInput(todayInputValue(), 30))
  const [orNumber, setOrNumber] = useState('')
  const [drNumber, setDrNumber] = useState('')
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  const [salesQuery, setSalesQuery] = useState('')
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [availableStock, setAvailableStock] = useState<number | null>(null)
  const [savingSale, setSavingSale] = useState(false)

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

  const draftLineTotal = useMemo(() => {
    const q = Number(sacks) || 0
    const p = Number(price) || 0
    return Math.round(q * p * 100) / 100
  }, [sacks, price])

  const cartTotal = useMemo(
    () => Math.round(cart.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100,
    [cart],
  )

  /** Cart wins once lines are added; otherwise the current variety row is the draft total. */
  const total = cart.length > 0 ? cartTotal : draftLineTotal

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, s, saleRows, dues, open] = await Promise.all([
        fetchBranches(),
        fetchSkus(),
        fetchSales(canViewAll ? null : profileBranchId || null),
        fetchOverdueDues(),
        user && profileBranchId ? fetchOpenShift(user.id, profileBranchId) : Promise.resolve(null),
      ])
      const defaultBranch = profileBranchId || b[0]?.id || ''
      setBranches(b)
      setSkus(s)
      setBranchId((prev) => prev || defaultBranch)
      if (s[0]?.variety_id) setVarietyId((prev) => prev || s[0].variety_id)

      setSales(saleRows)
      setOverdue(dues)
      setShift(open)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setFirstLoad(false)
    }
  }, [canViewAll, profileBranchId, user])

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
        setCustomerId((prev) => (rows.some((c) => c.id === prev) ? prev : ''))
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

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name, meta: c.contact ?? undefined })),
    [customers],
  )

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
    const totals = { cash: 0, gcash: 0, check: 0 }
    for (const sale of ledgerSales) {
      for (const p of sale.payments ?? []) {
        if (p.method === 'cash' || p.method === 'gcash' || p.method === 'check') {
          totals[p.method] += Number(p.amount)
        }
      }
    }
    return totals
  }, [ledgerSales])

  const ledgerPager = usePaged(ledgerSales, 10)
  const overduePager = usePaged(overdue, 10)
  const ledgerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ledgerRef.current?.scrollTo({ top: 0 })
  }, [ledgerPager.page, ledgerPager.pageSize, ledgerSales])

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
      const label = selectedSku ? skuLabel(selectedSku) : `Rice variety ${match[1].slice(0, 8)}`
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

  function onAddCartLine() {
    if (!canCreate || !selectedSku || !customerId) return
    setError(null)
    const qty = Number(sacks)
    const unitPrice = Number(price)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a number of sacks greater than zero.')
      return
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError('Enter a valid price per sack.')
      return
    }
    if (availableStock != null && qty > availableStock) {
      const branchName = branches.find((b) => b.id === branchId)?.name ?? 'this branch'
      setError(
        `Not enough stock for ${skuLabel(selectedSku)} at ${branchName} — ${availableStock} sack(s) on hand, ${qty} requested.`,
      )
      return
    }
    const existingSame = cart.find((line) => line.skuId === selectedSku.id)
    const alreadyQty = existingSame?.sacks ?? 0
    if (availableStock != null && alreadyQty + qty > availableStock) {
      setError(
        `Cart already has ${alreadyQty} sack(s) of ${skuLabel(selectedSku)}. Only ${availableStock} on hand.`,
      )
      return
    }
    setCart((prev) => {
      const match = prev.find((line) => line.skuId === selectedSku.id && line.pricePerSack === unitPrice)
      if (match) {
        const sacksNext = match.sacks + qty
        return prev.map((line) =>
          line.id === match.id
            ? {
                ...line,
                sacks: sacksNext,
                lineTotal: Math.round(sacksNext * unitPrice * 100) / 100,
              }
            : line,
        )
      }
      return [
        ...prev,
        {
          id: nextCartLineId(),
          skuId: selectedSku.id,
          label: skuLabel(selectedSku),
          sacks: qty,
          pricePerSack: unitPrice,
          lineTotal: Math.round(qty * unitPrice * 100) / 100,
        },
      ]
    })
    setSacks('20')
    setMessage(null)
  }

  async function onSaveSale(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || !customerId) return
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const printDr = submitter?.value === 'save-print'
    setError(null)
    setMessage(null)

    let lines = cart
    // One-click path: if nothing is in the cart yet, use the current variety row.
    if (lines.length === 0) {
      if (!selectedSku) {
        setError('Add at least one rice variety to the sale.')
        return
      }
      const qty = Number(sacks)
      const unitPrice = Number(price)
      if (!Number.isFinite(qty) || qty <= 0) {
        setError('Enter a number of sacks greater than zero.')
        return
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setError('Enter a valid price per sack.')
        return
      }
      lines = [
        {
          id: nextCartLineId(),
          skuId: selectedSku.id,
          label: skuLabel(selectedSku),
          sacks: qty,
          pricePerSack: unitPrice,
          lineTotal: Math.round(qty * unitPrice * 100) / 100,
        },
      ]
    }

    const saleTotal = Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100
    const gcashPart = Number(splitGcash || 0)
    if (splitPayment && (!Number.isFinite(gcashPart) || gcashPart <= 0 || gcashPart >= saleTotal)) {
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
      if (down > saleTotal) {
        setError(`Down payment cannot be more than the sale total (${formatPhp(saleTotal)}).`)
        return
      }
      if (!firstDueDate) {
        setError('Pick the first installment due date.')
        return
      }
    }

    const branchName = branches.find((b) => b.id === branchId)?.name ?? 'this branch'
    for (const line of lines) {
      let onHand: number | null = null
      try {
        onHand = await fetchAvailableStock(branchId, line.skuId)
      } catch {
        // Fall back to the RPC's own stock check.
      }
      if (onHand != null && line.sacks > onHand) {
        setError(
          `Not enough stock for ${line.label} at ${branchName} — ${onHand} sack(s) on hand, ${line.sacks} requested. Receive stock first.`,
        )
        return
      }
    }

    setSavingSale(true)
    try {
      const id = await createSale({
        branchId,
        customerId,
        paymentType,
        items: lines.map((line) => ({
          sku_id: line.skuId,
          sacks: line.sacks,
          price_per_sack: line.pricePerSack,
        })),
        orNumber: orNumber || undefined,
        drNumber: drNumber || undefined,
        downPayment: paymentType === 'installment' ? Number(downPayment || 0) : undefined,
        installmentParts: paymentType === 'installment' ? Number(parts || 1) : undefined,
        firstDueDate: paymentType === 'installment' ? firstDueDate : undefined,
        payments:
          splitPayment && paymentType !== 'installment'
            ? [
                { method: 'gcash', amount: Math.round(gcashPart * 100) / 100 },
                { method: 'cash', amount: Math.round((saleTotal - gcashPart) * 100) / 100 },
              ]
            : undefined,
      })
      const sale = await fetchSale(id)
      if (printDr) {
        setReceiptSale(sale)
        setTab('receipt')
        setNewSaleOpen(false)
      }
      setMessage(
        printDr
          ? `Sale saved · DR ${sale?.dr_number ?? ''}. Stock deducted.`
          : `Sale saved · DR ${sale?.dr_number ?? ''}. Customer kept — add another variant or close when done.`,
      )
      // Keep the customer selected so the next variants for the same buyer skip the picker.
      setCart([])
      setSacks('20')
      setOrNumber('')
      setDrNumber('')
      setDownPayment('')
      setSplitGcash('')
      setSplitPayment(false)
      await load()
    } catch (e) {
      setError(describeSaleError(e))
    } finally {
      setSavingSale(false)
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
      setPaySaleId('')
      setPayOpen(false)
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

  const receiptItems = receiptSale?.items ?? []
  const receiptPayments = [...(receiptSale?.payments ?? [])].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date),
  )
  const receiptSacks = receiptItems.reduce((sum, item) => sum + Number(item.sacks), 0)
  const receiptHasDiscount = receiptItems.some((item) => Number(item.discount) > 0)
  const receiptStatus = receiptSale?.status === 'void'
    ? 'voided'
    : Number(receiptSale?.balance) > 0
      ? Number(receiptSale?.amount_paid) > 0 ? 'partial' : 'unpaid'
      : 'paid'
  const receiptStatusLabel = {
    voided: 'Voided',
    partial: 'Partially paid',
    unpaid: 'Unpaid',
    paid: 'Fully paid',
  }[receiptStatus]

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
          index === 0 && pay.check ? '✓' : '',
          index === 0 && pay.cash ? '✓' : '',
          index === 0 && pay.gcash ? '✓' : '',
          index === 0 ? sale.dr_number ?? '' : '',
        ])
      })
    }
    rows.push(['TOTAL', '', '', '', historyBags, '', historyTotals.gross, '', '', '', ''])
    rows.push(['', '', 'CASH', '', '', '', paymentTotals.cash, '', '✓', '', ''])
    rows.push(['', '', 'GCASH', '', '', '', paymentTotals.gcash, '', '', '✓', ''])
    if (paymentTotals.check > 0) {
      rows.push(['', '', 'CHECK', '', '', '', paymentTotals.check, '✓', '', '', ''])
    }
    downloadExcel(
      `sales-in-${todayInputValue()}.xls`,
      'Sales-In',
      ['DATE', 'INVOICE NO.', 'NAME', 'DESCRIPTION', 'BAGS', 'PRICE', 'AMOUNT', 'CHEQUE', 'CASH', 'GCASH', 'DR NO.'],
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
            <DateInput id="first-due" value={firstDueDate} onChange={setFirstDueDate} />
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
        {cart.length > 0 ? (
          cart.map((line) => (
            <div key={line.id} className="sale-summary-row">
              <span className="muted">
                {line.label} · {formatQty(line.sacks)} × {formatPhp(line.pricePerSack)}
              </span>
              <span>{formatPhp(line.lineTotal)}</span>
            </div>
          ))
        ) : (
          <div className="sale-summary-row">
            <span className="muted">
              {sacks || 0} sack(s) × {formatPhp(Number(price || 0))}
            </span>
            <span>{formatPhp(draftLineTotal)}</span>
          </div>
        )}
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
          <span className="muted">Total{cart.length > 1 ? ` · ${cart.length} lines` : ''}</span>
          <strong>{formatPhp(total)}</strong>
        </div>
      </div>
    </div>
  )

  return (
    <div className="app-page stack sales-page">
      <div className="page-header">
        <div>
          <ScopePill label={branches.find((b) => b.id === branchId)?.name ?? user!.profile.branch?.name ?? 'Branch'} />
          <h1>Sales</h1>
          <p>New sales, history, installments and shifts</p>
        </div>
        {canCreate ? (
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={() => setPayOpen(true)}>
              Collect payment
            </Button>
            <Button onClick={() => setNewSaleOpen(true)}>New sale</Button>
          </div>
        ) : null}
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
            <Button
              variant="secondary"
              onClick={() => {
                setNewSaleOpen(false)
                setCart([])
              }}
            >
              {cart.length > 0 || customerId ? 'Done' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              form="new-sale-form"
              value="save-print"
              disabled={(!selectedSku && cart.length === 0) || !customerId || savingSale}
              loading={savingSale}
            >
              Save sale & print DR
            </Button>
            <Button
              type="submit"
              form="new-sale-form"
              disabled={(!selectedSku && cart.length === 0) || !customerId || savingSale}
              loading={savingSale}
            >
              Save sale
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

            <Field
              label="Customer"
              htmlFor="sale-customer"
              hint="Pick once — add every variety they want before saving."
            >
              <Combobox
                id="sale-customer"
                value={customerId}
                options={customerOptions}
                onChange={setCustomerId}
                placeholder="Search customer…"
                emptyText="No customer matches — use Quick add below."
              />
            </Field>

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

            {cart.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <span className="field-label" style={{ marginBottom: 0 }}>
                  Lines on this sale ({cart.length})
                </span>
                {cart.map((line) => (
                  <div key={line.id} className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <strong>{line.label}</strong>
                      <p className="faint" style={{ margin: 0 }}>
                        {formatQty(line.sacks)} sack(s) × {formatPhp(line.pricePerSack)} ={' '}
                        {formatPhp(line.lineTotal)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCart((prev) => prev.filter((l) => l.id !== line.id))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
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
                required={cart.length === 0}
                inputMode="decimal"
                value={sacks}
                onChange={(e) => setSacks(e.target.value)}
              />
            </Field>

            <Field label="Price per sack (₱)" htmlFor="sale-price">
              <TextInput
                id="sale-price"
                required={cart.length === 0}
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

            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={onAddCartLine}
                disabled={!selectedSku || !customerId}
              >
                + Add variety to sale
              </Button>
              <p className="faint" style={{ marginTop: 6 }}>
                Keep adding varieties for this customer, then Save once. Or Save with a single variety without
                adding to the list.
              </p>
            </div>

            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Field
                  label="Delivery Receipt #"
                  htmlFor="dr"
                  hint="From your printed DR. Leave blank to auto-generate."
                >
                  <TextInput
                    id="dr"
                    value={drNumber}
                    onChange={(e) => setDrNumber(e.target.value)}
                    placeholder="Auto"
                  />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Official Receipt # (optional)" htmlFor="or">
                  <TextInput id="or" value={orNumber} onChange={(e) => setOrNumber(e.target.value)} />
                </Field>
              </div>
            </div>

            {!selectedSku && cart.length === 0 ? (
              <p className="error-banner">No rice variety for this sack size.</p>
            ) : null}
          </form>
      </Modal>

      <Modal
        open={payOpen && canCreate}
        onClose={() => setPayOpen(false)}
        title="Collect installment payment"
        subtitle="The sale balance updates as soon as you save."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="collect-form">
              Collect payment
            </Button>
          </>
        }
      >
        <form id="collect-form" className="stack" onSubmit={onCollect}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="Sale with balance" htmlFor="pay-sale">
            <SelectInput
              id="pay-sale"
              required
              value={paySaleId}
              onChange={(e) => {
                setPaySaleId(e.target.value)
                const sale = sales.find((s) => s.id === e.target.value)
                if (sale) setPayAmount(String(sale.balance))
              }}
            >
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
          <p className="faint">No interest and no penalty — the amount goes straight to the sale balance.</p>
        </form>
      </Modal>

      {tab === 'sales' ? (
        <div className="stack">
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
                  <DateInput id="sales-from" value={historyFrom} onChange={setHistoryFrom} placeholder="Any date" />
                </Field>
              </div>
              <div style={{ flex: '1 1 150px' }}>
                <Field label="To" htmlFor="sales-to">
                  <DateInput id="sales-to" value={historyTo} onChange={setHistoryTo} placeholder="Any date" />
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
              <div className="row" style={{ gap: 8, paddingBottom: 2 }}>
                <Button
                  variant={
                    historyFrom === todayInputValue() && historyTo === todayInputValue()
                      ? 'primary'
                      : 'secondary'
                  }
                  onClick={() => {
                    setHistoryFrom(todayInputValue())
                    setHistoryTo(todayInputValue())
                  }}
                >
                  Today
                </Button>
                {historyFrom || historyTo ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setHistoryFrom('')
                      setHistoryTo('')
                    }}
                  >
                    All dates
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="sales-money" aria-label="Money summary">
              <div className="sales-money-main">
                <div className="sales-money-card is-gross">
                  <span>Gross</span>
                  <strong>{formatPhp(historyTotals.gross)}</strong>
                </div>
                <div className="sales-money-card is-collected">
                  <span>Collected</span>
                  <strong>{formatPhp(historyTotals.paid)}</strong>
                </div>
                <div className={`sales-money-card${historyTotals.balance > 0 ? ' is-due' : ' is-clear'}`}>
                  <span>Balance</span>
                  <strong>{formatPhp(historyTotals.balance)}</strong>
                </div>
              </div>
              <div className="sales-money-pay">
                <div className="sales-money-card is-cash">
                  <span>Cash</span>
                  <strong>{formatPhp(paymentTotals.cash)}</strong>
                </div>
                <div className="sales-money-card is-gcash">
                  <span>GCash</span>
                  <strong>{formatPhp(paymentTotals.gcash)}</strong>
                </div>
                <div className="sales-money-card is-check">
                  <span>Check</span>
                  <strong>{formatPhp(paymentTotals.check)}</strong>
                </div>
              </div>
            </div>
            {ledgerSales.length === 0 ? (
              <div className="empty-state">No sales for this filter.</div>
            ) : (
              <div
                className="sales-ledger"
                ref={ledgerRef}
                role="region"
                aria-label="Sales history list"
                tabIndex={0}
              >
                <Table className="ui-table-fluid">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice no.</th>
                      <th>Name</th>
                      <th>Description</th>
                      <th className="num">Bags</th>
                      <th className="num">Price</th>
                      <th className="num">Amount</th>
                      <th>Paid via</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerPager.pageItems.map((sale) => {
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
                          <td>
                            {index === 0 ? (
                              <div className="ledger-pay">
                                {pay.check ? <span className="ledger-pay-tag is-check">Cheque</span> : null}
                                {pay.cash ? <span className="ledger-pay-tag is-cash">Cash</span> : null}
                                {pay.gcash ? <span className="ledger-pay-tag is-gcash">GCash</span> : null}
                                {!pay.check && !pay.cash && !pay.gcash ? (
                                  <span className="muted">—</span>
                                ) : null}
                              </div>
                            ) : (
                              ''
                            )}
                          </td>
                          <td>
                            {index === 0 ? (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setReceiptSale(sale)
                                  setTab('receipt')
                                }}
                              >
                                Print DR
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
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </Table>
              </div>
            )}
            <Pagination
              page={ledgerPager.page}
              pageCount={ledgerPager.pageCount}
              pageSize={ledgerPager.pageSize}
              total={ledgerPager.total}
              start={ledgerPager.start}
              end={ledgerPager.end}
              onPage={ledgerPager.setPage}
              onPageSize={ledgerPager.setPageSize}
              noun="sale"
            />
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
                {overduePager.pageItems.map((d) => {
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
          <Pagination
            page={overduePager.page}
            pageCount={overduePager.pageCount}
            pageSize={overduePager.pageSize}
            total={overduePager.total}
            start={overduePager.start}
            end={overduePager.end}
            onPage={overduePager.setPage}
            onPageSize={overduePager.setPageSize}
            noun="due"
          />
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
            <article className="dr-sheet" aria-label="Delivery receipt">
              <header className="dr-header">
                <div className="dr-brand">
                  {settings?.logo_url ? <img src={settings.logo_url} alt="" className="dr-logo" /> : null}
                  <div>
                    <h2>{settings?.name ?? 'JMG Commodities Inc.'}</h2>
                    {settings?.address ? <p>{settings.address}</p> : null}
                    {settings?.contacts ? <p>{settings.contacts}</p> : null}
                    {settings?.tin ? <p>TIN: {settings.tin}</p> : null}
                  </div>
                </div>
                <div className="dr-meta">
                  <h3>Delivery receipt</h3>
                  <strong>{receiptSale.dr_number || 'Not assigned'}</strong>
                  <p>{formatDate(receiptSale.sale_date)}</p>
                  <span className={`dr-status is-${receiptStatus}`}>{receiptStatusLabel}</span>
                </div>
              </header>

              <div className="dr-parties">
                <section aria-label="Customer details">
                  <h3 className="dr-label">Customer</h3>
                  <strong className="dr-customer-name">{receiptSale.customer?.name || 'Walk-in customer'}</strong>
                  {receiptSale.customer?.address ? <p>{receiptSale.customer.address}</p> : null}
                  {receiptSale.customer?.contact ? <p>{receiptSale.customer.contact}</p> : null}
                </section>
                <dl className="dr-details">
                  <div><dt>Issuing branch</dt><dd>{receiptSale.branch?.name ?? '—'}</dd></div>
                  <div><dt>OR number</dt><dd>{receiptSale.or_number || 'Not recorded'}</dd></div>
                  <div><dt>Payment type</dt><dd>{receiptSale.payment_type === 'installment' ? 'Installment' : [...new Set(receiptPayments.map((p) => paymentMethodLabels[p.method]))].join(' + ') || paymentMethodLabels[receiptSale.payment_type]}</dd></div>
                </dl>
              </div>

              <div className="dr-table-scroll">
                <table className="dr-table">
                  <caption className="dr-label">Items delivered</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="dr-item-no">#</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="dr-num">Sacks</th>
                      <th scope="col" className="dr-num">Price / sack</th>
                      {receiptHasDiscount ? <th scope="col" className="dr-num">Discount</th> : null}
                      <th scope="col" className="dr-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptItems.map((item, index) => (
                      <tr key={item.id}>
                        <td className="dr-item-no">{index + 1}</td>
                        <td>{item.source_description || (item.sku ? skuLabel(item.sku) : item.sku_id)}</td>
                        <td className="dr-num">{formatQty(item.sacks)}</td>
                        <td className="dr-num">{formatPhp(item.price_per_sack)}</td>
                        {receiptHasDiscount ? <td className="dr-num">{formatPhp(item.discount)}</td> : null}
                        <td className="dr-num"><strong>{formatPhp(item.line_total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>Total sacks</th>
                      <td className="dr-num">{formatQty(receiptSacks)}</td>
                      <td colSpan={receiptHasDiscount ? 3 : 2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="dr-settlement">
                <section className="dr-payments" aria-label="Payment details">
                  <h3 className="dr-label">Payment details</h3>
                  {receiptPayments.length ? (
                    <ul className="dr-payment-list">
                      {receiptPayments.map((payment) => (
                        <li key={payment.id}>
                          <div>
                            <strong>{paymentMethodLabels[payment.method]}</strong>
                            <span>{formatDate(payment.payment_date)}</span>
                            {payment.reference_no ? <span>Reference: {payment.reference_no}</span> : null}
                          </div>
                          <strong className="dr-payment-amount">{formatPhp(payment.amount)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="dr-muted">No individual payment records available.</p>}
                  {receiptSale.notes ? (
                    <div className="dr-notes">
                      <h3 className="dr-label">Remarks</h3>
                      <p>{receiptSale.notes}</p>
                    </div>
                  ) : null}
                </section>

                <section className="dr-summary" aria-label="Amount summary">
                  <h3 className="dr-label">Amount summary</h3>
                  <dl>
                    <div><dt>Subtotal</dt><dd>{formatPhp(receiptSale.subtotal)}</dd></div>
                    <div><dt>Discount</dt><dd>{Number(receiptSale.discount) > 0 ? '− ' : ''}{formatPhp(receiptSale.discount)}</dd></div>
                    <div className="dr-grand-total"><dt>Total amount</dt><dd>{formatPhp(receiptSale.total)}</dd></div>
                    <div className="dr-paid"><dt>Amount paid</dt><dd>{formatPhp(receiptSale.amount_paid)}</dd></div>
                    <div className={`dr-balance is-${receiptStatus}`}>
                      <dt>Balance due</dt><dd>{formatPhp(receiptSale.balance)}</dd>
                    </div>
                  </dl>
                  <p className="dr-summary-note">{receiptStatus === 'voided' ? 'This sale has been voided.' : receiptStatus === 'paid' ? 'No outstanding balance.' : 'Outstanding balance as of this receipt.'}</p>
                </section>
              </div>

              <footer className="dr-footer">
                <div className="dr-signatures">
                  <div><span>Released by</span><small>Signature over printed name</small></div>
                  <div><span>Received by</span><small>Signature over printed name · Date</small></div>
                </div>
                <p>Thank you for choosing {settings?.name ?? 'JMG Commodities Inc.'}.</p>
              </footer>
            </article>
          ) : (
            <div className="empty-state">Save a sale to generate a Delivery Receipt.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
