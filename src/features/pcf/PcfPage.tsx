import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { useCompanySettings } from '../settings/useCompanySettings'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadExcel, printPage } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { ROLE_LABELS, canManagePcf, canReplenishPcf, canRequestPcfFund, canViewAllBranchesPcf, canViewPcf } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'
import { fetchBranches } from '../inventory/inventoryApi'
import {
  createFund,
  createReplenishment,
  createVoucher,
  fetchFundBalances,
  fetchReplenishments,
  fetchUnrecoveredVouchers,
  fetchVouchers,
  type PcfFundBalance,
  type PcfReplenishment,
  type PcfVoucher,
} from './pcfApi'
import './pcf.css'

const PCF_CATEGORIES = ['Supplies', 'Transportation', 'Repairs', 'Utilities', 'Food', 'Other']

type TabId = 'funds' | 'vouchers' | 'replenish' | 'request' | 'record' | 'report'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

function longDate(date: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  return d
    .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

interface RequestLine {
  id: string
  description: string
  amount: string
}

let lineSeq = 0
function newRequestLine(): RequestLine {
  lineSeq += 1
  return { id: `line-${lineSeq}`, description: '', amount: '' }
}

export function PcfPage() {
  const { user } = useAuth()
  const { settings } = useCompanySettings()
  const role = user!.profile.role
  const profileBranchId = user!.profile.branch_id
  const canView = canViewPcf(role)
  const canManage = canManagePcf(role)
  const canReplenish = canReplenishPcf(role)
  const canRequest = canRequestPcfFund(role)
  const canViewAll = canViewAllBranchesPcf(role)

  const [tab, setTab] = useState<TabId>('funds')
  const [funds, setFunds] = useState<PcfFundBalance[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [vouchers, setVouchers] = useState<PcfVoucher[]>([])
  const [replenishments, setReplenishments] = useState<PcfReplenishment[]>([])
  const [selectedFundId, setSelectedFundId] = useState<string>('')
  const [unrecovered, setUnrecovered] = useState<PcfVoucher[]>([])

  // Voucher form
  const [vDate, setVDate] = useState(todayInputValue())
  const [vPayee, setVPayee] = useState('')
  const [vPurpose, setVPurpose] = useState('')
  const [vCategory, setVCategory] = useState(PCF_CATEGORIES[0])
  const [vAmount, setVAmount] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)

  // Replenishment form
  const [rAmount, setRAmount] = useState('')
  const [rRef, setRRef] = useState('')
  const [rNotes, setRNotes] = useState('')

  // Fund setup form
  const [newFundBranch, setNewFundBranch] = useState('')
  const [newFundAmount, setNewFundAmount] = useState('')
  const [newFundThreshold, setNewFundThreshold] = useState('1000')
  const [newFundNotes, setNewFundNotes] = useState('')
  const [fundSaving, setFundSaving] = useState(false)

  // Request for fund / record sheet controls (null = derived default)
  const [requestNo, setRequestNo] = useState<string | null>(null)
  const [requestPurpose, setRequestPurpose] = useState('REQUEST FOR FUND')
  const [requestFrom, setRequestFrom] = useState<string | null>(null)
  const [requestTo, setRequestTo] = useState<string | null>(null)
  const [requestFunding, setRequestFunding] = useState<string | null>(null)
  const [requestApprovedBy, setRequestApprovedBy] = useState('')
  const [requestPresident, setRequestPresident] = useState('')
  const [requestReleasedDate, setRequestReleasedDate] = useState(todayInputValue())
  const [requestThru, setRequestThru] = useState('')
  const [requestLines, setRequestLines] = useState<RequestLine[]>(() => [newRequestLine()])
  const [recordFrom, setRecordFrom] = useState<string | null>(null)
  const [recordTo, setRecordTo] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [f, b] = await Promise.all([
        fetchFundBalances(),
        canManage ? fetchBranches() : Promise.resolve([] as Branch[]),
      ])
      setFunds(f)
      setBranches(b)
      const visibleFunds = canViewAll ? f : f.filter((fund) => fund.branch_id === profileBranchId)
      const firstFund = visibleFunds[0]?.id ?? f[0]?.id ?? ''
      setSelectedFundId((prev) => prev || firstFund)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [canViewAll, canManage, profileBranchId])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  const loadFundDetail = useCallback(async (fundId: string) => {
    if (!fundId) {
      setVouchers([])
      setReplenishments([])
      setUnrecovered([])
      return
    }
    try {
      const [v, r, u] = await Promise.all([
        fetchVouchers(fundId),
        fetchReplenishments(fundId),
        fetchUnrecoveredVouchers(fundId),
      ])
      setVouchers(v)
      setReplenishments(r)
      setUnrecovered(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (canView) void loadFundDetail(selectedFundId)
  }, [canView, loadFundDetail, selectedFundId])

  const selectedFund = useMemo(
    () => funds.find((f) => f.id === selectedFundId) ?? null,
    [funds, selectedFundId],
  )

  const visibleFunds = useMemo(
    () => (canViewAll ? funds : funds.filter((f) => f.branch_id === profileBranchId)),
    [funds, canViewAll, profileBranchId],
  )

  const availableBranches = useMemo(() => {
    const scoped = canViewAll ? branches : branches.filter((b) => b.id === profileBranchId)
    return scoped.filter((b) => !funds.some((f) => f.branch_id === b.id))
  }, [branches, funds, canViewAll, profileBranchId])

  useEffect(() => {
    setRequestNo(null)
    setRequestFrom(null)
    setRequestTo(null)
    setRequestFunding(null)
    setRequestLines([newRequestLine()])
    setRequestReleasedDate(todayInputValue())
    setRecordFrom(null)
    setRecordTo(null)
  }, [selectedFundId])

  const requestFromValue =
    requestFrom ?? (replenishments[0] ? addDays(replenishments[0].replenishment_date, 1) : monthStart())
  const requestToValue = requestTo ?? todayInputValue()
  const recordFromValue = recordFrom ?? monthStart()
  const recordToValue = recordTo ?? todayInputValue()
  const fundingValue =
    requestFunding == null ? Number(selectedFund?.fund_amount ?? 0) : Number(requestFunding) || 0
  const requestNoValue =
    requestNo ??
    `RFH-${(selectedFund?.branch?.name ?? 'PCF').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}-${todayInputValue().replace(/-/g, '')}`

  const requestVouchers = useMemo(
    () =>
      vouchers
        .filter((v) => v.voucher_date >= requestFromValue && v.voucher_date <= requestToValue)
        .slice()
        .sort((a, b) => a.voucher_date.localeCompare(b.voucher_date)),
    [vouchers, requestFromValue, requestToValue],
  )

  const categoryRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of requestVouchers) {
      const key = v.category || 'Other'
      map.set(key, (map.get(key) ?? 0) + Number(v.amount))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [requestVouchers])

  const filledRequestLines = useMemo(
    () =>
      requestLines.filter(
        (line) => line.description.trim() !== '' || (Number(line.amount) || 0) > 0,
      ),
    [requestLines],
  )

  const requestVoucherTotal = useMemo(
    () => requestVouchers.reduce((sum, v) => sum + Number(v.amount), 0),
    [requestVouchers],
  )

  const requestLinesTotal = useMemo(
    () => filledRequestLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [filledRequestLines],
  )

  const requestTotal = requestVoucherTotal + requestLinesTotal

  const recordEntries = useMemo(() => {
    const inRange = (date: string) => date >= recordFromValue && date <= recordToValue
    const vs = vouchers
      .filter((v) => inRange(v.voucher_date))
      .slice()
      .sort((a, b) => a.voucher_date.localeCompare(b.voucher_date))
    const rs = replenishments
      .filter((r) => inRange(r.replenishment_date))
      .slice()
      .sort((a, b) => a.replenishment_date.localeCompare(b.replenishment_date))
    const rows = [
      ...vs.map((v, index) => ({
        key: `v-${v.id}`,
        date: v.voucher_date,
        ref: `V-${String(index + 1).padStart(4, '0')}`,
        particulars: v.payee,
        category: v.category ?? '',
        expense: Number(v.amount),
        replenishment: 0,
      })),
      ...rs.map((r) => ({
        key: `r-${r.id}`,
        date: r.replenishment_date,
        ref: r.reference_no || 'Replenishment',
        particulars: r.notes || 'Fund replenishment',
        category: '',
        expense: 0,
        replenishment: Number(r.amount),
      })),
    ]
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref))
    let balance = Number(selectedFund?.fund_amount ?? 0)
    return rows.map((row) => {
      balance = balance - row.expense + row.replenishment
      return { ...row, balance }
    })
  }, [vouchers, replenishments, recordFromValue, recordToValue, selectedFund])

  const recordTotals = useMemo(() => {
    const expense = recordEntries.reduce((s, r) => s + r.expense, 0)
    const replenishment = recordEntries.reduce((s, r) => s + r.replenishment, 0)
    const opening = Number(selectedFund?.fund_amount ?? 0)
    return { expense, replenishment, opening, closing: opening - expense + replenishment }
  }, [recordEntries, selectedFund])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to petty cash.</div>
      </div>
    )
  }

  async function onVoucherSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !selectedFundId) return
    setError(null)
    setMessage(null)
    if (!vDate) {
      setError('Enter the voucher date.')
      return
    }
    if (!vPayee.trim()) {
      setError('Enter the payee.')
      return
    }
    if (!Number.isFinite(Number(vAmount)) || Number(vAmount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    try {
      let receiptPath: string | null = null
      if (vFile) {
        const path = `${selectedFundId}/${Date.now()}-${vFile.name}`
        const { error: upErr } = await supabase.storage.from('pcf-receipts').upload(path, vFile)
        if (upErr) throw upErr
        receiptPath = path
      }
      await createVoucher({
        fundId: selectedFundId,
        voucherDate: vDate,
        payee: vPayee,
        purpose: vPurpose,
        category: vCategory,
        amount: Number(vAmount),
        receiptPath,
        createdBy: user!.id,
      })
      setMessage('Voucher saved.')
      setVPayee('')
      setVPurpose('')
      setVAmount('')
      setVFile(null)
      await load()
      await loadFundDetail(selectedFundId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onReplenishSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canReplenish || !selectedFundId) return
    setError(null)
    setMessage(null)
    if (!rRef.trim()) {
      setError('Enter the replenishment reference number.')
      return
    }
    if (!Number.isFinite(Number(rAmount)) || Number(rAmount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    try {
      await createReplenishment({
        fundId: selectedFundId,
        amount: Number(rAmount),
        referenceNo: rRef,
        notes: rNotes,
        releasedBy: user!.id,
      })
      setMessage('Replenishment recorded.')
      setRAmount('')
      setRRef('')
      setRNotes('')
      await load()
      await loadFundDetail(selectedFundId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCreateFund(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    const branchId = newFundBranch || availableBranches[0]?.id || ''
    if (!branchId) {
      setError('Every branch already has a petty cash fund.')
      return
    }
    if (!Number.isFinite(Number(newFundAmount)) || Number(newFundAmount) <= 0) {
      setError('Enter an opening fund amount greater than zero.')
      return
    }
    if (!Number.isFinite(Number(newFundThreshold)) || Number(newFundThreshold) < 0) {
      setError('Enter a valid low fund threshold.')
      return
    }
    setError(null)
    setMessage(null)
    setFundSaving(true)
    try {
      const fund = await createFund({
        branchId,
        fundAmount: Number(newFundAmount),
        lowThreshold: Number(newFundThreshold),
        notes: newFundNotes,
      })
      setMessage('Petty cash fund created.')
      setNewFundAmount('')
      setNewFundNotes('')
      await load()
      setSelectedFundId(fund.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFundSaving(false)
    }
  }

  const lowFunds = visibleFunds.filter((f) => f.is_low)

  const branchLabel = selectedFund?.branch?.name ?? selectedFund?.branch_id ?? 'PCF'
  const companyName = settings?.name ?? 'JMG Commodities Inc.'
  const logoSrc = settings?.logo_url ?? '/JMG COMMODITIES.jpeg'
  const requestedByLine = `${user!.profile.full_name} (${ROLE_LABELS[role]})`

  function exportRequestExcel() {
    const balance = fundingValue - requestTotal
    downloadExcel(
      `request-for-fund-${requestNoValue}.xls`,
      'Request for Fund',
      ['Unit / Item', 'Description', 'Amount'],
      [
        [branchLabel, 'PETTY CASH REPLENISHMENT', ''],
        ['', `EXPENSE INCURRED ${longDate(requestFromValue)} - ${longDate(requestToValue)}`, ''],
        ...categoryRows.map(([name, amount]) => ['', name, Number(amount).toFixed(2)]),
        ...filledRequestLines.map((line) => [
          '',
          line.description.trim(),
          (Number(line.amount) || 0).toFixed(2),
        ]),
        ['', 'TOTAL EXPENSE', requestTotal.toFixed(2)],
        ['', 'PCF FUNDING', fundingValue.toFixed(2)],
        ['', 'BALANCE', balance.toFixed(2)],
        ['', 'FOR REQUEST', requestTotal.toFixed(2)],
        ['', 'Requested by', requestedByLine],
        ['', 'Approved by', requestApprovedBy],
        ['', 'President', requestPresident],
      ],
    )
  }

  function exportRecordExcel() {
    downloadExcel(
      `pcf-record-${branchLabel.replace(/\s+/g, '-')}-${recordFromValue}-to-${recordToValue}.xls`,
      'PCF Record',
      ['Date', 'Ref', 'Particulars', 'Category', 'Expenses', 'Replenishment', 'Balance'],
      [
        ['', '', 'Opening fund', '', '', '', recordTotals.opening.toFixed(2)],
        ...recordEntries.map((r) => [
          r.date,
          r.ref,
          r.particulars,
          r.category,
          r.expense ? r.expense.toFixed(2) : '',
          r.replenishment ? r.replenishment.toFixed(2) : '',
          r.balance.toFixed(2),
        ]),
        ['', '', 'TOTAL', '', recordTotals.expense.toFixed(2), recordTotals.replenishment.toFixed(2), recordTotals.closing.toFixed(2)],
      ],
    )
  }

  function exportReportExcel() {
    downloadExcel(
      `pcf-report-${branchLabel.replace(/\s+/g, '-')}-${recordFromValue}-to-${recordToValue}.xls`,
      'PCF Report',
      ['Item', 'Date', 'Payee / Reference', 'Category', 'Amount'],
      [
        ['Opening fund', '', '', '', Number(selectedFund?.fund_amount ?? 0).toFixed(2)],
        ...vouchers.map((v) => ['Voucher', v.voucher_date, v.payee, v.category ?? '', Number(v.amount).toFixed(2)]),
        ...replenishments.map((r) => ['Replenishment', r.replenishment_date, r.reference_no ?? '', '', Number(r.amount).toFixed(2)]),
        ['Vouchers total', '', '', '', Number(selectedFund?.vouchers_total ?? 0).toFixed(2)],
        ['Replenishments total', '', '', '', Number(selectedFund?.replenishments_total ?? 0).toFixed(2)],
        ['Current balance', '', '', '', Number(selectedFund?.balance ?? 0).toFixed(2)],
      ],
    )
  }

  function addRequestLine() {
    setRequestLines((prev) => [...prev, newRequestLine()])
  }

  function updateRequestLine(id: string, field: 'description' | 'amount', value: string) {
    setRequestLines((prev) => prev.map((line) => (line.id === id ? { ...line, [field]: value } : line)))
  }

  function removeRequestLine(id: string) {
    setRequestLines((prev) =>
      prev.length === 1 ? [newRequestLine()] : prev.filter((line) => line.id !== id),
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Petty Cash Fund</h1>
          <p>Per-branch PCF, vouchers with receipts, replenishments, and printable report.</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {lowFunds.length > 0 ? (
        <div className="error-banner">
          Low fund alert: {lowFunds.map((f) => `${f.branch?.name ?? f.branch_id ?? ''} (${formatPhp(f.balance)})`).join(', ')}
        </div>
      ) : null}

      {visibleFunds.length > 1 ? (
        <div className="no-print">
          <Field label="Branch fund" htmlFor="pcf-fund">
            <SelectInput
              id="pcf-fund"
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
            >
              {visibleFunds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.branch?.name ?? f.branch_id}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      ) : null}

      <ChipRow>
        <Chip active={tab === 'funds'} onClick={() => setTab('funds')}>
          Funds
        </Chip>
        <Chip active={tab === 'vouchers'} onClick={() => setTab('vouchers')}>
          Vouchers
        </Chip>
        {canReplenish ? (
          <Chip active={tab === 'replenish'} onClick={() => setTab('replenish')}>
            Replenish
          </Chip>
        ) : null}
        {canRequest ? (
          <Chip active={tab === 'request'} onClick={() => setTab('request')}>
            Request for fund
          </Chip>
        ) : null}
        <Chip active={tab === 'record'} onClick={() => setTab('record')}>
          Record
        </Chip>
        <Chip active={tab === 'report'} onClick={() => setTab('report')}>
          Report
        </Chip>
      </ChipRow>

      {loading ? <SkeletonTable rows={5} cols={5} /> : null}

      {tab === 'funds' ? (
        <div className="stack">
          <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
            {visibleFunds.length === 0 ? (
              <Card title="No PCF fund">
                <p className="muted">No petty cash fund is set up for your branch yet.</p>
              </Card>
            ) : (
              visibleFunds.map((f) => (
                <Card
                  key={f.id}
                  title={f.branch?.name ?? 'PCF'}
                  subtitle={f.is_low ? '⚠ Low fund' : 'OK'}
                >
                  <div className="stack" style={{ gap: 4 }}>
                    <p className="muted">Opening fund</p>
                    <strong style={{ fontSize: 20 }}>{formatPhp(f.fund_amount)}</strong>
                    <p className="muted" style={{ marginTop: 8 }}>Current balance</p>
                    <strong style={{ fontSize: 24, color: f.is_low ? 'var(--color-danger)' : 'var(--color-jade)' }}>
                      {formatPhp(f.balance)}
                    </strong>
                    <p className="faint">
                      Vouchers: {formatPhp(f.vouchers_total)} · Replenishments: {formatPhp(f.replenishments_total)}
                    </p>
                    <p className="faint">Low threshold: {formatPhp(f.low_threshold)}</p>
                  </div>
                </Card>
              ))
            )}
          </div>

          {canManage && availableBranches.length > 0 ? (
            <Card
              title="Set up petty cash fund"
              subtitle="One opening fund per branch — branch accountants can set up their own branch"
            >
              <form className="stack" onSubmit={onCreateFund}>
                <Field label="Branch" htmlFor="pcf-new-branch">
                  <SelectInput
                    id="pcf-new-branch"
                    required
                    value={newFundBranch || availableBranches[0].id}
                    onChange={(e) => setNewFundBranch(e.target.value)}
                  >
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Opening fund (₱)" htmlFor="pcf-new-amount">
                  <TextInput
                    id="pcf-new-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={newFundAmount}
                    onChange={(e) => setNewFundAmount(e.target.value)}
                  />
                </Field>
                <Field label="Low fund alert at (₱)" htmlFor="pcf-new-threshold">
                  <TextInput
                    id="pcf-new-threshold"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={newFundThreshold}
                    onChange={(e) => setNewFundThreshold(e.target.value)}
                  />
                </Field>
                <Field label="Notes" htmlFor="pcf-new-notes">
                  <TextArea
                    id="pcf-new-notes"
                    value={newFundNotes}
                    onChange={(e) => setNewFundNotes(e.target.value)}
                  />
                </Field>
                <Button type="submit" loading={fundSaving}>
                  Create fund
                </Button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'vouchers' ? (
        <div className="stack">
          {canManage && selectedFund ? (
            <Card title="New voucher">
              <form className="stack" onSubmit={onVoucherSubmit}>
                <Field label="Date" htmlFor="pcf-v-date">
                  <TextInput id="pcf-v-date" type="date" required value={vDate} onChange={(e) => setVDate(e.target.value)} />
                </Field>
                <Field label="Payee" htmlFor="pcf-v-payee">
                  <TextInput id="pcf-v-payee" required value={vPayee} onChange={(e) => setVPayee(e.target.value)} />
                </Field>
                <Field label="Category" htmlFor="pcf-v-cat">
                  <SelectInput id="pcf-v-cat" value={vCategory} onChange={(e) => setVCategory(e.target.value)}>
                    {PCF_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Purpose" htmlFor="pcf-v-purpose">
                  <TextInput id="pcf-v-purpose" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} />
                </Field>
                <Field label="Amount (₱)" htmlFor="pcf-v-amt">
                  <TextInput
                    id="pcf-v-amt"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={vAmount}
                    onChange={(e) => setVAmount(e.target.value)}
                  />
                </Field>
                <Field label="Receipt photo" htmlFor="pcf-v-file">
                  <input
                    id="pcf-v-file"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setVFile(e.target.files?.[0] ?? null)}
                  />
                </Field>
                <Button type="submit">Save voucher</Button>
              </form>
            </Card>
          ) : null}

          <Card title={`Vouchers (${vouchers.length})`}>
            {vouchers.length === 0 ? (
              <div className="empty-state">No vouchers yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Category</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id}>
                      <td>{formatDate(v.voucher_date)}</td>
                      <td>{v.payee}</td>
                      <td>{v.category ?? '—'}</td>
                      <td>{v.purpose ?? '—'}</td>
                      <td>{formatPhp(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'replenish' && canReplenish ? (
        <div className="stack">
          {selectedFund ? (
            <Card title={`Replenish fund — ${selectedFund.branch?.name ?? selectedFund.branch_id}`}>
              <p className="muted">
                Unrecovered vouchers: <strong>{unrecovered.length}</strong> totaling{' '}
                <strong>{formatPhp(unrecovered.reduce((s, v) => s + Number(v.amount), 0))}</strong>
              </p>
              <form className="stack" onSubmit={onReplenishSubmit}>
                <Field label="Amount (₱)" htmlFor="pcf-r-amt">
                  <TextInput
                    id="pcf-r-amt"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={rAmount}
                    onChange={(e) => setRAmount(e.target.value)}
                  />
                </Field>
                <Field label="Reference no." htmlFor="pcf-r-ref">
                  <TextInput id="pcf-r-ref" required value={rRef} onChange={(e) => setRRef(e.target.value)} />
                </Field>
                <Field label="Notes" htmlFor="pcf-r-notes">
                  <TextArea id="pcf-r-notes" value={rNotes} onChange={(e) => setRNotes(e.target.value)} />
                </Field>
                <Button type="submit">
                  Record replenishment
                </Button>
              </form>
            </Card>
          ) : null}

          <Card title={`Replenishment history (${replenishments.length})`}>
            {replenishments.length === 0 ? (
              <div className="empty-state">No replenishments yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Released by</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishments.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.replenishment_date)}</td>
                      <td>{r.reference_no ?? '—'}</td>
                      <td>{formatPhp(r.amount)}</td>
                      <td>{r.releaser?.full_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'request' && canRequest && selectedFund ? (
        <div className="stack">
          <Card title="Request details" className="no-print">
            <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
              <Field label="RFH #" htmlFor="req-no">
                <TextInput id="req-no" value={requestNoValue} onChange={(e) => setRequestNo(e.target.value)} />
              </Field>
              <Field label="Purpose" htmlFor="req-purpose">
                <TextInput id="req-purpose" value={requestPurpose} onChange={(e) => setRequestPurpose(e.target.value)} />
              </Field>
              <Field label="Expenses from" htmlFor="req-from">
                <TextInput
                  id="req-from"
                  type="date"
                  value={requestFromValue}
                  onChange={(e) => setRequestFrom(e.target.value)}
                />
              </Field>
              <Field label="Expenses to" htmlFor="req-to">
                <TextInput
                  id="req-to"
                  type="date"
                  value={requestToValue}
                  onChange={(e) => setRequestTo(e.target.value)}
                />
              </Field>
              <Field label="PCF funding (₱)" htmlFor="req-funding">
                <TextInput
                  id="req-funding"
                  inputMode="decimal"
                  value={requestFunding ?? String(selectedFund.fund_amount)}
                  onChange={(e) => setRequestFunding(e.target.value)}
                />
              </Field>
              <Field label="Approved by" htmlFor="req-approved">
                <TextInput
                  id="req-approved"
                  value={requestApprovedBy}
                  onChange={(e) => setRequestApprovedBy(e.target.value)}
                  placeholder="Name"
                />
              </Field>
              <Field label="President" htmlFor="req-president">
                <TextInput
                  id="req-president"
                  value={requestPresident}
                  onChange={(e) => setRequestPresident(e.target.value)}
                  placeholder="Name"
                />
              </Field>
              <Field label="Released date" htmlFor="req-released">
                <TextInput
                  id="req-released"
                  type="date"
                  value={requestReleasedDate}
                  onChange={(e) => setRequestReleasedDate(e.target.value)}
                />
              </Field>
              <Field label="Thru" htmlFor="req-thru">
                <TextInput
                  id="req-thru"
                  value={requestThru}
                  onChange={(e) => setRequestThru(e.target.value)}
                  placeholder="Released thru"
                />
              </Field>
            </div>

            <div className="stack" style={{ gap: 8, marginTop: 16 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                Additional lines — typed straight into the form
              </span>
              {requestLines.map((line) => (
                <div key={line.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <TextInput
                      value={line.description}
                      onChange={(e) => updateRequestLine(line.id, 'description', e.target.value)}
                      placeholder="Description"
                      aria-label="Description"
                    />
                  </div>
                  <div style={{ width: 170 }}>
                    <TextInput
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) => updateRequestLine(line.id, 'amount', e.target.value)}
                      placeholder="Amount (₱)"
                      aria-label="Amount"
                    />
                  </div>
                  <Button variant="ghost" onClick={() => removeRequestLine(line.id)}>
                    Remove
                  </Button>
                </div>
              ))}
              <div>
                <Button variant="secondary" onClick={addRequestLine}>
                  + Add line
                </Button>
              </div>
            </div>

            <p className="faint" style={{ marginTop: 10 }}>
              {requestVouchers.length} voucher(s) in range
              {filledRequestLines.length > 0 ? ` + ${filledRequestLines.length} typed line(s)` : ''} ·
              Total {formatPhp(requestTotal)} · Balance {formatPhp(fundingValue - requestTotal)}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={exportRequestExcel}>
                Export Excel
              </Button>
              <Button variant="ghost" onClick={printPage} title="A4 portrait — select EPSON L1320 in the print dialog">
                Print / PDF
              </Button>
            </div>
            <p className="faint" style={{ marginTop: 8 }}>
              A4 portrait. The browser print dialog lists every installed printer — choose the
              EPSON L1320 there; a website cannot pre-select or hide printers.
            </p>
          </Card>

          <div className="pcf-sheet">
            <header className="pcf-sheet-head">
              <img src={logoSrc} alt="" className="pcf-sheet-logo" />
              <div className="pcf-sheet-company">
                <strong>{companyName}</strong>
                {settings?.address ? <span>{settings.address}</span> : null}
                {settings?.contacts ? <span>{settings.contacts}</span> : null}
              </div>
            </header>

            <h2 className="pcf-sheet-title">REQUEST FOR FUND</h2>

            <div className="pcf-sheet-meta">
              <div>
                <strong>RFH#:</strong> {requestNoValue}
              </div>
              <div>
                <strong>DATE:</strong> {longDate(requestToValue)}
              </div>
            </div>
            <div className="pcf-sheet-purpose">
              <strong>DESCRIPTION/ PURPOSE:</strong> <span>{requestPurpose}</span>
            </div>

            <table className="pcf-form-table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>UNIT/ ITEM</th>
                  <th>DESCRIPTION</th>
                  <th style={{ width: '24%' }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    rowSpan={categoryRows.length + filledRequestLines.length + 1}
                    className="pcf-unit"
                  >
                    {branchLabel}
                    <br />
                    PETTY CASH
                    <br />
                    REPLENISHMENT
                  </td>
                  <td className="pcf-period">
                    EXPENSE INCURRED {longDate(requestFromValue)} - {longDate(requestToValue)}
                  </td>
                  <td />
                </tr>
                {categoryRows.map(([name, amount]) => (
                  <tr key={name}>
                    <td>{name.toUpperCase()}</td>
                    <td className="pcf-num">{formatPhp(amount)}</td>
                  </tr>
                ))}
                {filledRequestLines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description.trim().toUpperCase()}</td>
                    <td className="pcf-num">{formatPhp(Number(line.amount) || 0)}</td>
                  </tr>
                ))}
                {categoryRows.length === 0 && filledRequestLines.length === 0 ? (
                  <tr>
                    <td className="muted">No expenses in this period.</td>
                    <td className="pcf-num">{formatPhp(0)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="pcf-right pcf-strong">TOTAL EXPENSE</td>
                  <td className="pcf-num pcf-strong">{formatPhp(requestTotal)}</td>
                </tr>
                <tr>
                  <td className="pcf-right">PCF FUNDING</td>
                  <td className="pcf-num">{formatPhp(fundingValue)}</td>
                </tr>
                <tr>
                  <td className="pcf-right pcf-strong pcf-red">BALANCE</td>
                  <td className="pcf-num pcf-strong pcf-red">{formatPhp(fundingValue - requestTotal)}</td>
                </tr>
                <tr className="pcf-for-request">
                  <td />
                  <td className="pcf-right pcf-strong">FOR REQUEST</td>
                  <td className="pcf-num pcf-strong pcf-red">{formatPhp(requestTotal)}</td>
                </tr>
              </tbody>
            </table>

            <div className="pcf-signatures">
              <div>
                <span>REQUESTED BY:</span>
                <strong>{user!.profile.full_name}</strong>
                <em>{ROLE_LABELS[role].toUpperCase()}</em>
              </div>
              <div>
                <span>APPROVED BY :</span>
                <strong>{requestApprovedBy || '\u00A0'}</strong>
                <em>FINANCE MANAGER</em>
              </div>
              <div>
                <span>{'\u00A0'}</span>
                <strong>{requestPresident || '\u00A0'}</strong>
                <em>PRESIDENT</em>
              </div>
              <div>
                <span>RELEASED DATE:</span>
                <strong>{requestReleasedDate ? longDate(requestReleasedDate) : '\u00A0'}</strong>
              </div>
              <div>
                <span>THRU:</span>
                <strong>{requestThru || '\u00A0'}</strong>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'record' && selectedFund ? (
        <div className="stack">
          <Card title="Record period" className="no-print">
            <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
              <Field label="From" htmlFor="rec-from">
                <TextInput
                  id="rec-from"
                  type="date"
                  value={recordFromValue}
                  onChange={(e) => setRecordFrom(e.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="rec-to">
                <TextInput
                  id="rec-to"
                  type="date"
                  value={recordToValue}
                  onChange={(e) => setRecordTo(e.target.value)}
                />
              </Field>
            </div>
            <p className="faint" style={{ marginTop: 10 }}>
              Opening {formatPhp(recordTotals.opening)} · Expenses {formatPhp(recordTotals.expense)} ·
              Replenishments {formatPhp(recordTotals.replenishment)} · Balance{' '}
              {formatPhp(recordTotals.closing)}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={exportRecordExcel}>
                Export Excel
              </Button>
              <Button variant="ghost" onClick={printPage}>
                Print / PDF
              </Button>
            </div>
          </Card>

          <div className="pcf-sheet">
            <header className="pcf-sheet-head">
              <img src={logoSrc} alt="" className="pcf-sheet-logo" />
              <div className="pcf-sheet-company">
                <strong>{companyName}</strong>
                {settings?.address ? <span>{settings.address}</span> : null}
                {settings?.contacts ? <span>{settings.contacts}</span> : null}
              </div>
            </header>

            <h2 className="pcf-sheet-title">PETTY CASH MONITORING</h2>
            <p className="pcf-sheet-sub">
              {branchLabel} · {longDate(recordFromValue)} - {longDate(recordToValue)}
            </p>

            <table className="pcf-form-table pcf-record-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>REF</th>
                  <th>PARTICULARS</th>
                  <th>CATEGORY</th>
                  <th>EXPENSES</th>
                  <th>REPLENISHMENT</th>
                  <th>BALANCE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="pcf-strong">
                    OPENING FUND
                  </td>
                  <td className="pcf-num">{formatPhp(recordTotals.opening)}</td>
                </tr>
                {recordEntries.map((r) => (
                  <tr key={r.key}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.ref}</td>
                    <td>{r.particulars}</td>
                    <td>{r.category || '—'}</td>
                    <td className="pcf-num">{r.expense ? formatPhp(r.expense) : ''}</td>
                    <td className="pcf-num">{r.replenishment ? formatPhp(r.replenishment) : ''}</td>
                    <td className="pcf-num">{formatPhp(r.balance)}</td>
                  </tr>
                ))}
                {recordEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No vouchers or replenishments in this period.
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={4} className="pcf-right pcf-strong">
                    TOTAL
                  </td>
                  <td className="pcf-num pcf-strong">{formatPhp(recordTotals.expense)}</td>
                  <td className="pcf-num pcf-strong">{formatPhp(recordTotals.replenishment)}</td>
                  <td className="pcf-num pcf-strong">{formatPhp(recordTotals.closing)}</td>
                </tr>
              </tbody>
            </table>

            <div className="pcf-signatures">
              <div>
                <span>PREPARED BY:</span>
                <strong>{user!.profile.full_name}</strong>
                <em>{ROLE_LABELS[role].toUpperCase()}</em>
              </div>
              <div>
                <span>CUSTODIAN:</span>
                <strong>{selectedFund.custodian?.full_name || '\u00A0'}</strong>
              </div>
              <div>
                <span>APPROVED BY:</span>
                <strong>{requestApprovedBy || '\u00A0'}</strong>
                <em>FINANCE MANAGER</em>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'report' && selectedFund ? (
        <div className="stack">
          <Card title={`PCF Report — ${selectedFund.branch?.name ?? selectedFund.branch_id}`}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
              <div>
                <p className="muted">Opening fund</p>
                <strong style={{ fontSize: 20 }}>{formatPhp(selectedFund.fund_amount)}</strong>
              </div>
              <div>
                <p className="muted">Vouchers total</p>
                <strong style={{ fontSize: 20 }}>{formatPhp(selectedFund.vouchers_total)}</strong>
              </div>
              <div>
                <p className="muted">Replenishments total</p>
                <strong style={{ fontSize: 20 }}>{formatPhp(selectedFund.replenishments_total)}</strong>
              </div>
              <div>
                <p className="muted">Current balance</p>
                <strong style={{ fontSize: 20 }}>{formatPhp(selectedFund.balance)}</strong>
              </div>
            </div>

            <h3 style={{ marginTop: 24 }}>Vouchers</h3>
            {vouchers.length === 0 ? (
              <p className="muted">No vouchers.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Category</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id}>
                      <td>{formatDate(v.voucher_date)}</td>
                      <td>{v.payee}</td>
                      <td>{v.category ?? '—'}</td>
                      <td>{v.purpose ?? '—'}</td>
                      <td>{formatPhp(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Total</strong></td>
                    <td><strong>{formatPhp(selectedFund.vouchers_total)}</strong></td>
                  </tr>
                </tfoot>
              </Table>
            )}

            <h3 style={{ marginTop: 24 }}>Replenishments</h3>
            {replenishments.length === 0 ? (
              <p className="muted">No replenishments.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishments.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.replenishment_date)}</td>
                      <td>{r.reference_no ?? '—'}</td>
                      <td>{formatPhp(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <div className="no-print row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={exportReportExcel}>
              Export Excel
            </Button>
            <Button variant="ghost" onClick={printPage}>
              Print / PDF
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
