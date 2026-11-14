import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { ExpensesPanel } from '../expenses/ExpensesPanel'
import { useCompanySettings } from '../settings/useCompanySettings'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadExcel, printPage } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { ROLE_LABELS, canManagePcf, canReplenishPcf, canRequestPcfFund, canViewAllBranchesPcf, canViewPcf } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'
import { fetchBranches } from '../inventory/inventoryApi'
import {
  PCF_VOUCHER_LIMIT,
  createFund,
  createReplenishment,
  createVoucher,
  fetchFundBalances,
  fetchReplenishments,
  fetchUnrecoveredVouchers,
  fetchVouchers,
  pcfReceiptUrl,
  type PcfFundBalance,
  type PcfReplenishment,
  type PcfVoucher,
} from './pcfApi'
import './pcf.css'

const PCF_CATEGORIES = ['Supplies', 'Transportation', 'Repairs', 'Utilities', 'Food', 'Other']

type TabId = 'funds' | 'vouchers' | 'replenish' | 'expenses' | 'report'

const TABS: { id: TabId; label: string; needs?: 'replenish' }[] = [
  { id: 'funds', label: 'Funds' },
  { id: 'vouchers', label: 'Vouchers' },
  { id: 'replenish', label: 'Replenishments', needs: 'replenish' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'report', label: 'Report' },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function longDate(date: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  return d
    .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

export function PcfPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const [fundOpen, setFundOpen] = useState(false)
  const [voucherOpen, setVoucherOpen] = useState(false)
  const [replenishOpen, setReplenishOpen] = useState(false)
  const [vCategory, setVCategory] = useState(PCF_CATEGORIES[0])
  const [vAmount, setVAmount] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)
  const [voucherSearch, setVoucherSearch] = useState('')

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

  // Monitoring period controls (null = derived default)
  const [recordFrom, setRecordFrom] = useState<string | null>(null)
  const [recordTo, setRecordTo] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState('')

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

  const recordFromValue = recordFrom ?? monthStart()
  const recordToValue = recordTo ?? todayInputValue()

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

  const voucherNumbers = useMemo(() => {
    const sorted = vouchers
      .slice()
      .sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.created_at.localeCompare(b.created_at))
    const map = new Map<string, string>()
    sorted.forEach((voucher, index) => {
      map.set(voucher.id, `PCF-${String(index + 1).padStart(4, '0')}`)
    })
    return map
  }, [vouchers])

  const searchTerm = voucherSearch.trim().toLowerCase()
  const recentVouchers = useMemo(
    () =>
      vouchers.filter(
        (v) =>
          !searchTerm ||
          v.payee.toLowerCase().includes(searchTerm) ||
          (v.purpose ?? '').toLowerCase().includes(searchTerm),
      ),
    [vouchers, searchTerm],
  )

  const recentPager = usePaged(recentVouchers, 10)
  const voucherPager = usePaged(vouchers, 10)
  const replenishPager = usePaged(replenishments, 10)
  const reportVoucherPager = usePaged(vouchers, 10)
  const reportReplenishPager = usePaged(replenishments, 10)

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
    if (Number(vAmount) > PCF_VOUCHER_LIMIT) {
      setError(
        `Petty cash vouchers are limited to ${formatPhp(PCF_VOUCHER_LIMIT)}. Use Fund Requests for larger expenses.`,
      )
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
      setVoucherOpen(false)
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
      setReplenishOpen(false)
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
      setFundOpen(false)
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

  const unrecoveredTotal = unrecovered.reduce((sum, v) => sum + Number(v.amount), 0)
  const unrecoveredIds = new Set(unrecovered.map((v) => v.id))
  const fundAmount = Number(selectedFund?.fund_amount ?? 0)
  const meterPercent = fundAmount > 0 ? Math.min(100, Math.max(0, (Number(selectedFund?.balance ?? 0) / fundAmount) * 100)) : 0
  const markerPercent = fundAmount > 0 ? Math.min(100, Math.max(0, (Number(selectedFund?.low_threshold ?? 0) / fundAmount) * 100)) : 0

  function openReplenish() {
    setRAmount(unrecoveredTotal > 0 ? String(unrecoveredTotal) : '')
    setReplenishOpen(true)
  }

  function onPrintReport() {
    setTab('report')
    window.setTimeout(() => printPage(), 120)
  }

  const branchLabel = selectedFund?.branch?.name ?? selectedFund?.branch_id ?? 'PCF'
  const companyName = settings?.name ?? 'JMG Commodities Inc.'
  const logoSrc = settings?.logo_url ?? '/JMG COMMODITIES.jpeg'

  async function openReceipt(path: string) {
    setError(null)
    try {
      const url = await pcfReceiptUrl(path)
      if (!url) {
        setError('Receipt could not be opened.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Petty cash</h1>
          <p>{branchLabel}</p>
        </div>
        <div className="pcf-toolbar no-print">
          {visibleFunds.length > 1 ? (
            <SelectInput
              className="pcf-fund-pick"
              value={selectedFundId}
              onChange={(e) => setSelectedFundId(e.target.value)}
              aria-label="Branch fund"
            >
              {visibleFunds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.branch?.name ?? f.branch_id}
                </option>
              ))}
            </SelectInput>
          ) : null}
          <Button variant="secondary" onClick={onPrintReport}>
            Print report
          </Button>
          {canRequest ? (
            <Button variant="secondary" onClick={() => navigate('/app/fund-requests?tab=rfh')}>
              Request replenishment
            </Button>
          ) : null}
          {canManage && selectedFund ? (
            <Button onClick={() => setVoucherOpen(true)}>New money out</Button>
          ) : null}
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {lowFunds.length > 0 ? (
        <div className="error-banner">
          Low fund alert: {lowFunds.map((f) => `${f.branch?.name ?? f.branch_id ?? ''} (${formatPhp(f.balance)})`).join(', ')}
        </div>
      ) : null}

      <div className="pcf-tabs no-print" role="tablist">
        {TABS.filter((item) => (item.needs === 'replenish' ? canReplenish : true)).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`pcf-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : null}

      {tab === 'funds' ? (
        <div className="stack">
          {selectedFund ? (
            <>
              <div className="pcf-funds">
                <section className="pcf-fund-card">
                  <header className="pcf-fund-head">
                    <div>
                      <span className="pcf-eyebrow">Branch fund</span>
                      <h2>{selectedFund.branch?.name ?? selectedFund.branch_id}</h2>
                    </div>
                    <span className={`pcf-fund-badge${selectedFund.is_low ? ' is-low' : ''}`}>
                      {selectedFund.is_low ? 'Low' : 'OK'}
                    </span>
                  </header>

                  <p className="pcf-fund-balance">
                    {formatPhp(selectedFund.balance)}
                    <span className="pcf-fund-of">of {formatPhp(selectedFund.fund_amount)} fund</span>
                  </p>

                  <div className="pcf-meter" aria-hidden="true">
                    <span
                      className={`pcf-meter-fill${selectedFund.is_low ? ' is-low' : ''}`}
                      style={{ width: `${meterPercent}%` }}
                    />
                    <span className="pcf-meter-marker" style={{ left: `${markerPercent}%` }} />
                  </div>

                  <div className="pcf-fund-meta">
                    <span>
                      Vouchers {formatPhp(selectedFund.vouchers_total)} · Replenished{' '}
                      {formatPhp(selectedFund.replenishments_total)}
                    </span>
                    <span>Low at {formatPhp(selectedFund.low_threshold)}</span>
                  </div>

                  <p className="pcf-fund-custodian">
                    Custodian: {selectedFund.custodian?.full_name ?? 'Unassigned'}
                  </p>

                  {canManage && availableBranches.length > 0 ? (
                    <div className="pcf-fund-actions">
                      <Button variant="ghost" onClick={() => setFundOpen(true)}>
                        Set up another fund
                      </Button>
                    </div>
                  ) : null}
                </section>

                <section className="pcf-ready-card">
                  <span className="pcf-eyebrow">Ready to replenish</span>
                  <p className="pcf-ready-total">{formatPhp(unrecoveredTotal)}</p>
                  <p className="pcf-ready-sub">
                    {unrecovered.length} unrecovered voucher{unrecovered.length === 1 ? '' : 's'}
                  </p>
                  <p className="pcf-ready-explain">
                    Vouchers logged after the last replenishment. Request this amount to bring the
                    fund back to {formatPhp(selectedFund.fund_amount)}.
                  </p>
                  {canReplenish ? (
                    <Button onClick={openReplenish} disabled={unrecovered.length === 0}>
                      Request replenishment
                    </Button>
                  ) : canRequest ? (
                    <Button
                      variant="secondary"
                      onClick={() => navigate('/app/fund-requests?tab=rfh')}
                    >
                      Prepare request
                    </Button>
                  ) : (
                    <p className="faint">The branch accountant or Owner records replenishments.</p>
                  )}
                </section>
              </div>

              <Card title="Recent vouchers">
                <div className="pcf-voucher-search">
                  <TextInput
                    type="search"
                    placeholder="Search payee or purpose"
                    value={voucherSearch}
                    onChange={(e) => setVoucherSearch(e.target.value)}
                    aria-label="Search vouchers"
                  />
                </div>
                {recentVouchers.length === 0 ? (
                  <div className="empty-state">
                    {vouchers.length === 0 ? 'No vouchers yet.' : 'No vouchers match your search.'}
                  </div>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <th>Voucher</th>
                        <th>Date</th>
                        <th>Payee</th>
                        <th>Purpose</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Receipt</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPager.pageItems.map((v) => (
                        <tr key={v.id}>
                          <td className="pcf-cell-ref">{voucherNumbers.get(v.id)}</td>
                          <td>{formatDate(v.voucher_date)}</td>
                          <td className="pcf-cell-primary">{v.payee}</td>
                          <td>{v.purpose ?? '—'}</td>
                          <td>{v.category ?? '—'}</td>
                          <td className="pcf-cell-amount">{formatPhp(v.amount)}</td>
                          <td>
                            {v.receipt_path ? (
                              <Button variant="ghost" onClick={() => void openReceipt(v.receipt_path!)}>
                                View
                              </Button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span className={`pcf-status${unrecoveredIds.has(v.id) ? ' is-pending' : ''}`}>
                              {unrecoveredIds.has(v.id) ? 'Not replenished' : 'Replenished'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
                <Pagination
                  page={recentPager.page}
                  pageCount={recentPager.pageCount}
                  pageSize={recentPager.pageSize}
                  total={recentPager.total}
                  start={recentPager.start}
                  end={recentPager.end}
                  onPage={recentPager.setPage}
                  onPageSize={recentPager.setPageSize}
                  noun="voucher"
                />
              </Card>
            </>
          ) : (
            <Card title="No PCF fund">
              <p className="muted">No petty cash fund is set up for your branch yet.</p>
              {canManage && availableBranches.length > 0 ? (
                <div className="pcf-fund-actions">
                  <Button onClick={() => setFundOpen(true)}>Set up fund</Button>
                </div>
              ) : null}
            </Card>
          )}
          {canManage && availableBranches.length > 0 ? (
            <Modal
              open={fundOpen}
              onClose={() => setFundOpen(false)}
              title="Set up petty cash fund"
              subtitle="One opening fund per branch."
              size="sm"
              footer={
                <>
                  <Button variant="secondary" onClick={() => setFundOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" form="pcf-fund-form" loading={fundSaving}>
                    Create fund
                  </Button>
                </>
              }
            >
              <form id="pcf-fund-form" className="stack" onSubmit={onCreateFund}>
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
              </form>
            </Modal>
          ) : null}
        </div>
      ) : null}

      {tab === 'vouchers' ? (
        <div className="stack">
          <Card
            title={`Vouchers (${vouchers.length})`}
            action={
              canManage && selectedFund ? <Button onClick={() => setVoucherOpen(true)}>New voucher</Button> : null
            }
          >
            {vouchers.length === 0 ? (
              <div className="empty-state">No vouchers yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Voucher</th>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Category</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {voucherPager.pageItems.map((v) => (
                    <tr key={v.id}>
                      <td className="pcf-cell-ref">{voucherNumbers.get(v.id)}</td>
                      <td>{formatDate(v.voucher_date)}</td>
                      <td>{v.payee}</td>
                      <td>{v.category ?? '—'}</td>
                      <td>{v.purpose ?? '—'}</td>
                      <td>{formatPhp(v.amount)}</td>
                      <td>
                        {v.receipt_path ? (
                          <Button variant="ghost" onClick={() => void openReceipt(v.receipt_path!)}>
                            View
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={voucherPager.page}
              pageCount={voucherPager.pageCount}
              pageSize={voucherPager.pageSize}
              total={voucherPager.total}
              start={voucherPager.start}
              end={voucherPager.end}
              onPage={voucherPager.setPage}
              onPageSize={voucherPager.setPageSize}
              noun="voucher"
            />
          </Card>
        </div>
      ) : null}

      {tab === 'replenish' && canReplenish ? (
        <div className="stack">
          <Card
            title={`Replenishment history (${replenishments.length})`}
            action={selectedFund ? <Button onClick={openReplenish}>Replenish</Button> : null}
          >
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
                  {replenishPager.pageItems.map((r) => (
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
            <Pagination
              page={replenishPager.page}
              pageCount={replenishPager.pageCount}
              pageSize={replenishPager.pageSize}
              total={replenishPager.total}
              start={replenishPager.start}
              end={replenishPager.end}
              onPage={replenishPager.setPage}
              onPageSize={replenishPager.setPageSize}
              noun="replenishment"
            />
          </Card>
        </div>
      ) : null}

      {tab === 'expenses' ? <ExpensesPanel /> : null}

      {tab === 'report' && selectedFund ? (
        <div className="stack">
          <Card title="Monitoring period" className="no-print">
            <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
              <Field label="From" htmlFor="rec-from">
                <DateInput
                  id="rec-from"
                  value={recordFromValue}
                  onChange={setRecordFrom}
                />
              </Field>
              <Field label="To" htmlFor="rec-to">
                <DateInput
                  id="rec-to"
                  value={recordToValue}
                  onChange={setRecordTo}
                />
              </Field>
              <Field label="Approved by" htmlFor="rec-approved">
                <TextInput
                  id="rec-approved"
                  value={approvedBy}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  placeholder="Finance manager"
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
                Export monitoring Excel
              </Button>
              <Button variant="secondary" onClick={exportReportExcel}>
                Export summary Excel
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
                <strong>{approvedBy || '\u00A0'}</strong>
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
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {reportVoucherPager.pageItems.map((v) => (
                    <tr key={v.id}>
                      <td>{formatDate(v.voucher_date)}</td>
                      <td>{v.payee}</td>
                      <td>{v.category ?? '—'}</td>
                      <td>{v.purpose ?? '—'}</td>
                      <td>{formatPhp(v.amount)}</td>
                      <td>
                        {v.receipt_path ? (
                          <Button variant="ghost" onClick={() => void openReceipt(v.receipt_path!)}>
                            View
                          </Button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Total</strong></td>
                    <td><strong>{formatPhp(selectedFund.vouchers_total)}</strong></td>
                    <td />
                  </tr>
                </tfoot>
              </Table>
            )}
            <Pagination
              page={reportVoucherPager.page}
              pageCount={reportVoucherPager.pageCount}
              pageSize={reportVoucherPager.pageSize}
              total={reportVoucherPager.total}
              start={reportVoucherPager.start}
              end={reportVoucherPager.end}
              onPage={reportVoucherPager.setPage}
              onPageSize={reportVoucherPager.setPageSize}
              noun="voucher"
            />

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
                  {reportReplenishPager.pageItems.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.replenishment_date)}</td>
                      <td>{r.reference_no ?? '—'}</td>
                      <td>{formatPhp(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={reportReplenishPager.page}
              pageCount={reportReplenishPager.pageCount}
              pageSize={reportReplenishPager.pageSize}
              total={reportReplenishPager.total}
              start={reportReplenishPager.start}
              end={reportReplenishPager.end}
              onPage={reportReplenishPager.setPage}
              onPageSize={reportReplenishPager.setPageSize}
              noun="replenishment"
            />
          </Card>
        </div>
      ) : null}

      {canManage && selectedFund ? (
        <Modal
          open={voucherOpen}
          onClose={() => setVoucherOpen(false)}
          title="New money out"
          subtitle="Petty cash paid out — attach the receipt photo."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoucherOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="pcf-voucher-form">
                Save voucher
              </Button>
            </>
          }
        >
          <form id="pcf-voucher-form" className="stack" onSubmit={onVoucherSubmit}>
            <Field label="Date" htmlFor="pcf-v-date">
              <DateInput id="pcf-v-date" value={vDate} onChange={setVDate} />
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
                max={PCF_VOUCHER_LIMIT}
                step="0.01"
                required
                value={vAmount}
                onChange={(e) => setVAmount(e.target.value)}
              />
            </Field>
            <p className="faint">
              Petty cash covers expenses up to {formatPhp(PCF_VOUCHER_LIMIT)} per voucher. Anything
              above that goes through{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setVoucherOpen(false)
                  navigate('/app/fund-requests')
                }}
              >
                Fund Requests
              </button>
              .
            </p>
            <Field label="Receipt photo" htmlFor="pcf-v-file">
              <input
                id="pcf-v-file"
                type="file"
                accept="image/*"
                onChange={(e) => setVFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </form>
        </Modal>
      ) : null}

      {selectedFund ? (
        <Modal
          open={replenishOpen}
          onClose={() => setReplenishOpen(false)}
          title={`Replenish fund — ${selectedFund.branch?.name ?? selectedFund.branch_id}`}
          subtitle={`Unrecovered vouchers: ${unrecovered.length} · ${formatPhp(unrecoveredTotal)}`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setReplenishOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="pcf-replenish-form">
                Record replenishment
              </Button>
            </>
          }
        >
          <form id="pcf-replenish-form" className="stack" onSubmit={onReplenishSubmit}>
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
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
