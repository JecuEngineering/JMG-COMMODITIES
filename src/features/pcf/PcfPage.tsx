import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
import { useCompanySettings } from '../settings/useCompanySettings'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv, downloadExcel, printPage } from '../../lib/export'
import { formatAmount, formatPhp } from '../../lib/money'
import { ROLE_LABELS, canManagePcf, canReplenishPcf, canRequestPcfFund, canViewAllBranchesPcf, canViewPcf } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'
import { fetchBranches } from '../inventory/inventoryApi'
import {
  PCF_CLASSIFICATIONS,
  PCF_VOUCHER_LIMIT,
  closePeriod,
  createFund,
  createReplenishment,
  createVoucher,
  fetchFundBalances,
  fetchPeriods,
  fetchReplenishments,
  fetchUnrecoveredVouchers,
  fetchVouchers,
  pcfClassification,
  pcfReceiptUrl,
  type PcfFundBalance,
  type PcfPeriod,
  type PcfReplenishment,
  type PcfVoucher,
} from './pcfApi'
import './pcf.css'

type TabId = 'funds' | 'vouchers' | 'replenish' | 'report'

const TABS: { id: TabId; label: string; needs?: 'replenish' }[] = [
  { id: 'funds', label: 'Funds' },
  { id: 'vouchers', label: 'Expenses' },
  { id: 'replenish', label: 'Replenishments', needs: 'replenish' },
  { id: 'report', label: 'Report' },
]

/** Same style as the workbook tab names: NOV 9, NOV 15. */
function sheetLabel(date = todayInputValue()) {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }).toUpperCase()
}

function byVoucherOrder(a: PcfVoucher, b: PcfVoucher) {
  return (
    a.voucher_date.localeCompare(b.voucher_date) ||
    (a.voucher_no ?? '').localeCompare(b.voucher_no ?? '') ||
    a.created_at.localeCompare(b.created_at)
  )
}

function longDate(date: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  return d
    .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

/** M/D/YYYY, the date style of the monitoring sheet. */
function sheetDate(date: string) {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}/${y}`
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
  const [vCategory, setVCategory] = useState<string>(PCF_CLASSIFICATIONS[4])
  const [vAmount, setVAmount] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)
  const [vFileKey, setVFileKey] = useState(0)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const [attachVoucher, setAttachVoucher] = useState<PcfVoucher | null>(null)
  const [attachSaving, setAttachSaving] = useState(false)
  const [voucherSearch, setVoucherSearch] = useState('')
  const [voucherCategory, setVoucherCategory] = useState('')

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

  // Expense sheets
  const [periods, setPeriods] = useState<PcfPeriod[]>([])
  const [reportPeriodId, setReportPeriodId] = useState('')
  const [cutOpen, setCutOpen] = useState(false)
  const [cutLabel, setCutLabel] = useState('')
  const [cutNotes, setCutNotes] = useState('')
  const [cutSaving, setCutSaving] = useState(false)
  const [historyPeriod, setHistoryPeriod] = useState<PcfPeriod | null>(null)

  // Monitoring sheet controls
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
      setPeriods([])
      setUnrecovered([])
      return
    }
    try {
      const [v, r, u, p] = await Promise.all([
        fetchVouchers(fundId),
        fetchReplenishments(fundId),
        fetchUnrecoveredVouchers(fundId),
        fetchPeriods(fundId),
      ])
      setVouchers(v)
      setReplenishments(r)
      setUnrecovered(u)
      setPeriods(p)
      setReportPeriodId('')
      setHistoryPeriod(null)
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

  const openPeriod = useMemo(() => periods.find((p) => p.status === 'open') ?? null, [periods])
  const closedPeriods = useMemo(() => periods.filter((p) => p.status === 'closed'), [periods])

  /** Vouchers of the open sheet; before a fund has periods, all vouchers count as current. */
  const currentPeriodVouchers = useMemo(() => {
    const list = openPeriod
      ? vouchers.filter((v) => v.period_id === openPeriod.id)
      : periods.length === 0
        ? vouchers
        : vouchers.filter((v) => !v.period_id)
    return list.slice().sort(byVoucherOrder)
  }, [vouchers, openPeriod, periods.length])

  const currentPeriodTotal = useMemo(
    () => currentPeriodVouchers.reduce((sum, v) => sum + Number(v.amount), 0),
    [currentPeriodVouchers],
  )

  const reportPeriod = useMemo(
    () => periods.find((p) => p.id === reportPeriodId) ?? openPeriod ?? null,
    [periods, reportPeriodId, openPeriod],
  )

  const reportVouchers = useMemo(() => {
    if (reportPeriod) {
      return vouchers.filter((v) => v.period_id === reportPeriod.id).slice().sort(byVoucherOrder)
    }
    return periods.length === 0 ? vouchers.slice().sort(byVoucherOrder) : []
  }, [vouchers, reportPeriod, periods.length])

  const liquidationRows = useMemo(() => {
    let lastDate = ''
    return reportVouchers.map((voucher) => {
      const showDate = voucher.voucher_date !== lastDate
      lastDate = voucher.voucher_date
      return {
        voucher,
        classification: pcfClassification(voucher.category),
        amount: Number(voucher.amount),
        showDate,
      }
    })
  }, [reportVouchers])

  const classTotals = useMemo(() => {
    const totals = new Map<string, number>(PCF_CLASSIFICATIONS.map((c) => [c, 0]))
    for (const row of liquidationRows) {
      totals.set(row.classification, (totals.get(row.classification) ?? 0) + row.amount)
    }
    return totals
  }, [liquidationRows])

  const periodTotals = useMemo(() => {
    const expense = liquidationRows.reduce((sum, row) => sum + row.amount, 0)
    const replenishment = reportPeriod
      ? replenishments
          .filter((r) =>
            reportPeriod.replenishment_id
              ? r.id === reportPeriod.replenishment_id
              : r.replenishment_date >= reportPeriod.start_date &&
                r.replenishment_date <= (reportPeriod.end_date ?? todayInputValue()),
          )
          .reduce((sum, r) => sum + Number(r.amount), 0)
      : 0
    const opening = Number(selectedFund?.fund_amount ?? 0)
    return { expense, replenishment, opening, closing: opening + replenishment - expense }
  }, [liquidationRows, replenishments, reportPeriod, selectedFund])

  const historyVouchers = useMemo(() => {
    if (!historyPeriod) return []
    return vouchers
      .filter((v) => v.period_id === historyPeriod.id)
      .slice()
      .sort(byVoucherOrder)
  }, [vouchers, historyPeriod])

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
  const voucherRef = useCallback(
    (voucher: PcfVoucher) => voucher.voucher_no ?? voucherNumbers.get(voucher.id) ?? '',
    [voucherNumbers],
  )

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

  const filteredVouchers = useMemo(
    () =>
      currentPeriodVouchers.filter((v) => {
        if (voucherCategory && pcfClassification(v.category) !== voucherCategory) return false
        if (!searchTerm) return true
        return (
          v.payee.toLowerCase().includes(searchTerm) ||
          (v.purpose ?? '').toLowerCase().includes(searchTerm) ||
          (v.voucher_no ?? '').toLowerCase().includes(searchTerm)
        )
      }),
    [currentPeriodVouchers, voucherCategory, searchTerm],
  )

  const filteredVoucherTotal = useMemo(
    () => filteredVouchers.reduce((sum, v) => sum + Number(v.amount), 0),
    [filteredVouchers],
  )

  const recentPager = usePaged(recentVouchers, 10)
  const voucherPager = usePaged(filteredVouchers, 15)
  const replenishPager = usePaged(replenishments, 10)

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
        const safeName = vFile.name.replace(/[^\w.-]+/g, '_')
        const path = `${selectedFundId}/${Date.now()}-${safeName}`
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
      setVFileKey((k) => k + 1)
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

  function openCut() {
    if (!openPeriod) return
    setCutLabel(sheetLabel(openPeriod.end_date ?? todayInputValue()))
    setCutNotes('')
    setError(null)
    setCutOpen(true)
  }

  async function onCutSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !openPeriod) return
    if (currentPeriodVouchers.length === 0) {
      setError('Add at least one expense before ending this sheet.')
      return
    }
    setCutSaving(true)
    setError(null)
    setMessage(null)
    try {
      await closePeriod(
        openPeriod.id,
        cutLabel.trim() || sheetLabel(openPeriod.end_date ?? todayInputValue()),
        cutNotes.trim(),
      )
      setCutOpen(false)
      setReportPeriodId('')
      setHistoryPeriod(null)
      setMessage('Sheet ended. The next expenses start a new sheet.')
      await loadFundDetail(selectedFundId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCutSaving(false)
    }
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

  function pickReceipt(voucher: PcfVoucher) {
    setAttachVoucher(voucher)
    receiptInputRef.current?.click()
  }

  async function onReceiptPicked(file: File | null) {
    const voucher = attachVoucher
    if (!file || !voucher || !selectedFundId) return
    setAttachSaving(true)
    setError(null)
    setMessage(null)
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_')
      const path = `${selectedFundId}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('pcf-receipts').upload(path, file)
      if (uploadError) throw uploadError
      const { error: updateError } = await supabase
        .from('pcf_vouchers')
        .update({ receipt_path: path })
        .eq('id', voucher.id)
      if (updateError) throw updateError
      setMessage(`Receipt attached to ${voucherRef(voucher)}.`)
      await loadFundDetail(selectedFundId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAttachSaving(false)
      setAttachVoucher(null)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }

  function receiptCell(voucher: PcfVoucher) {
    if (voucher.receipt_path) {
      return (
        <div className="pcf-receipt-cell">
          <Button variant="ghost" onClick={() => void openReceipt(voucher.receipt_path!)}>
            View
          </Button>
          {canManage ? (
            <button type="button" className="link-button" onClick={() => pickReceipt(voucher)}>
              Replace
            </button>
          ) : null}
        </div>
      )
    }
    return canManage ? (
      <Button variant="ghost" disabled={attachSaving} onClick={() => pickReceipt(voucher)}>
        Attach
      </Button>
    ) : (
      <span className="faint">None</span>
    )
  }

  async function receiptLinkMap(list: PcfVoucher[]): Promise<Map<string, string>> {
    const paths = [...new Set(list.map((v) => v.receipt_path).filter((p): p is string => Boolean(p)))]
    const pairs = await Promise.all(
      paths.map(async (path) => {
        try {
          const url = await pcfReceiptUrl(path, 60 * 60 * 24 * 7)
          return [path, url ?? ''] as const
        } catch {
          return [path, ''] as const
        }
      }),
    )
    return new Map(pairs)
  }

  function receiptExportCell(voucher: PcfVoucher, links: Map<string, string>) {
    if (!voucher.receipt_path) return 'No receipt'
    const url = links.get(voucher.receipt_path)
    if (url) return { text: 'View receipt', href: url }
    return voucher.receipt_path.split('/').pop() ?? 'Receipt'
  }

  async function exportLiquidationExcel() {
    const links = await receiptLinkMap(reportVouchers)
    downloadExcel(
      `pcf-liquidation-${branchLabel.replace(/\s+/g, '-')}-${reportPeriod?.label.replace(/\s+/g, '-') ?? todayInputValue()}.xls`,
      `PCF ${reportPeriod?.label ?? 'Liquidation'}`,
      ['DATE', 'PCV#', 'DESCRIPTION', ...PCF_CLASSIFICATIONS, 'AMOUNT', 'RECEIPT'],
      [
        ...liquidationRows.map((row) => [
          sheetDate(row.voucher.voucher_date),
          voucherRef(row.voucher),
          row.voucher.payee,
          ...PCF_CLASSIFICATIONS.map((c) => (c === row.classification ? row.amount.toFixed(2) : '')),
          row.amount.toFixed(2),
          receiptExportCell(row.voucher, links),
        ]),
        [
          '',
          '',
          'TOTAL',
          ...PCF_CLASSIFICATIONS.map((c) => {
            const total = classTotals.get(c) ?? 0
            return total ? total.toFixed(2) : ''
          }),
          periodTotals.expense.toFixed(2),
          '',
        ],
      ],
    )
  }

  async function exportExpensesExcel() {
    const links = await receiptLinkMap(filteredVouchers)
    downloadExcel(
      `pcf-expenses-${branchLabel.replace(/\s+/g, '-')}-${openPeriod?.label.replace(/\s+/g, '-') ?? todayInputValue()}.xls`,
      'PCF Expenses',
      ['DATE', 'PCV#', 'DESCRIPTION', 'PURPOSE', 'CLASSIFICATION', 'AMOUNT', 'RECEIPT'],
      [
        ...filteredVouchers.map((v) => [
          v.voucher_date,
          voucherRef(v),
          v.payee,
          v.purpose ?? '',
          pcfClassification(v.category),
          Number(v.amount).toFixed(2),
          receiptExportCell(v, links),
        ]),
        ['', '', '', '', 'TOTAL', filteredVoucherTotal.toFixed(2), ''],
      ],
    )
  }

  async function exportExpensesCsv() {
    const links = await receiptLinkMap(filteredVouchers)
    downloadCsv(
      `pcf-expenses-${branchLabel.replace(/\s+/g, '-')}-${openPeriod?.label.replace(/\s+/g, '-') ?? todayInputValue()}.csv`,
      ['DATE', 'PCV#', 'DESCRIPTION', 'PURPOSE', 'CLASSIFICATION', 'AMOUNT', 'RECEIPT'],
      [
        ...filteredVouchers.map((v) => [
          v.voucher_date,
          voucherRef(v),
          v.payee,
          v.purpose ?? '',
          pcfClassification(v.category),
          Number(v.amount).toFixed(2),
          receiptExportCell(v, links),
        ]),
        ['', '', '', '', 'TOTAL', filteredVoucherTotal.toFixed(2), ''],
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
            <Button onClick={() => setVoucherOpen(true)}>Add expense</Button>
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
                          <td className="pcf-cell-ref">{voucherRef(v)}</td>
                          <td>{formatDate(v.voucher_date)}</td>
                          <td className="pcf-cell-primary">{v.payee}</td>
                          <td>{v.purpose ?? '—'}</td>
                          <td>{v.category ?? '—'}</td>
                          <td className="pcf-cell-amount">{formatPhp(v.amount)}</td>
                          <td>{receiptCell(v)}</td>
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
            title="Current expense sheet"
            subtitle={
              openPeriod
                ? 'Expenses accumulate here until you end the sheet.'
                : 'Expenses logged before the first cut.'
            }
            action={
              canManage && selectedFund ? (
                <div className="row">
                  <Button
                    variant="secondary"
                    onClick={openCut}
                    disabled={!openPeriod || currentPeriodVouchers.length === 0}
                  >
                    End sheet / Cut
                  </Button>
                  <Button onClick={() => setVoucherOpen(true)}>Add expense</Button>
                </div>
              ) : null
            }
          >
            <div className="pcf-current-sheet">
              <div className="pcf-current-head">
                <div>
                  <span className="pcf-sheet-badge">{openPeriod?.label ?? 'NEW SHEET'}</span>
                  <p className="pcf-current-range">
                    {openPeriod
                      ? `${longDate(openPeriod.start_date)} - ${longDate(openPeriod.end_date ?? todayInputValue())}`
                      : 'No open sheet yet'}
                  </p>
                </div>
                <div className="pcf-current-total">
                  <span>Sheet expenses</span>
                  <strong>{formatPhp(currentPeriodTotal)}</strong>
                </div>
              </div>
              <div className="pcf-cut-summary">
                <div>
                  <span>Entries</span>
                  <strong>{currentPeriodVouchers.length}</strong>
                </div>
                <div>
                  <span>Fund balance</span>
                  <strong>{formatPhp(selectedFund?.balance ?? 0)}</strong>
                </div>
                <div>
                  <span>To replenish / refund</span>
                  <strong>{formatPhp(unrecoveredTotal)}</strong>
                </div>
              </div>
              <p className="faint">
                Record the replenishment first, then end this sheet. Ending it stores the expenses in
                sheet history and starts a new empty sheet for the next expenses.
              </p>
            </div>
          </Card>

          <Card
            title="Expense list"
            className="no-print"
            subtitle={`${filteredVouchers.length} entr${filteredVouchers.length === 1 ? 'y' : 'ies'} · Total ${formatPhp(filteredVoucherTotal)}`}
          >
            <div className="row" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
              <Field label="Classification" htmlFor="pcf-ex-cat">
                <SelectInput
                  id="pcf-ex-cat"
                  value={voucherCategory}
                  onChange={(e) => setVoucherCategory(e.target.value)}
                >
                  <option value="">All classifications</option>
                  {PCF_CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Search" htmlFor="pcf-ex-search">
                <TextInput
                  id="pcf-ex-search"
                  type="search"
                  placeholder="Description, purpose or PCV#"
                  value={voucherSearch}
                  onChange={(e) => setVoucherSearch(e.target.value)}
                />
              </Field>
            </div>
            <div className="row" style={{ gap: 8, margin: '12px 0' }}>
              <Button variant="secondary" onClick={() => void exportExpensesExcel()}>
                Export Excel
              </Button>
              <Button variant="secondary" onClick={() => void exportExpensesCsv()}>
                Export CSV
              </Button>
              <Button variant="ghost" onClick={printPage}>
                Print / PDF
              </Button>
            </div>

            {currentPeriodVouchers.length === 0 ? (
              <div className="empty-state">No expenses in this sheet yet.</div>
            ) : filteredVouchers.length === 0 ? (
              <div className="empty-state">No expenses match this filter.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>PCV#</th>
                    <th>Description</th>
                    <th>Classification</th>
                    <th>Purpose</th>
                    <th>Amount</th>
                    <th>Receipt</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {voucherPager.pageItems.map((v) => (
                    <tr key={v.id}>
                      <td>{formatDate(v.voucher_date)}</td>
                      <td className="pcf-cell-ref">{voucherRef(v)}</td>
                      <td className="pcf-cell-primary">{v.payee}</td>
                      <td>{pcfClassification(v.category)}</td>
                      <td>{v.purpose ?? '—'}</td>
                      <td className="pcf-cell-amount">{formatPhp(v.amount)}</td>
                      <td>{receiptCell(v)}</td>
                      <td>
                        <span className={`pcf-status${unrecoveredIds.has(v.id) ? ' is-pending' : ''}`}>
                          {unrecoveredIds.has(v.id) ? 'Not replenished' : 'Replenished'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>
                      <strong>Total</strong>
                    </td>
                    <td className="pcf-cell-amount">
                      <strong>{formatPhp(filteredVoucherTotal)}</strong>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
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
              noun="expense"
            />
          </Card>

          <Card
            title={`Sheet history (${closedPeriods.length})`}
            subtitle="Every cut keeps its vouchers, receipts and total, like the separate workbook sheets."
          >
            {closedPeriods.length === 0 ? (
              <div className="empty-state">No sheets ended yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Dates</th>
                    <th className="num">Entries</th>
                    <th className="num">Total</th>
                    <th>Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {closedPeriods.map((p) => (
                    <tr key={p.id}>
                      <td className="pcf-cell-primary">{p.label}</td>
                      <td>
                        {formatDate(p.start_date)} –{' '}
                        {formatDate(p.end_date ?? p.start_date)}
                      </td>
                      <td className="num">{p.voucher_count}</td>
                      <td className="pcf-cell-amount">{formatPhp(p.total)}</td>
                      <td>{p.notes ?? '—'}</td>
                      <td>
                        <Button variant="ghost" onClick={() => setHistoryPeriod(p)}>
                          View
                        </Button>
                      </td>
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

      {tab === 'report' && selectedFund ? (
        <div className="stack">
          <Card title="Monitoring sheet" className="no-print">
            <div className="row" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
              <Field label="Expense sheet" htmlFor="rec-sheet">
                <SelectInput
                  id="rec-sheet"
                  value={reportPeriod?.id ?? ''}
                  onChange={(e) => setReportPeriodId(e.target.value)}
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {p.status === 'open' ? 'current' : 'closed'} · {formatPhp(p.total)}
                    </option>
                  ))}
                  {periods.length === 0 ? <option value="">All expenses</option> : null}
                </SelectInput>
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
              {liquidationRows.length} voucher{liquidationRows.length === 1 ? '' : 's'} · Expenses{' '}
              {formatPhp(periodTotals.expense)} · Replenishments {formatPhp(periodTotals.replenishment)} ·
              Balance {formatPhp(periodTotals.closing)}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => void exportLiquidationExcel()}>
                Export liquidation Excel
              </Button>
              <Button variant="ghost" onClick={printPage}>
                Print / PDF
              </Button>
            </div>
          </Card>

          <div className="pcf-sheet pcf-landscape">
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
              {branchLabel} · {reportPeriod?.label ?? 'ALL EXPENSES'} ·{' '}
              {longDate(reportPeriod?.start_date ?? '')} -{' '}
              {longDate(reportPeriod?.end_date ?? todayInputValue())}
            </p>

            <div className="pcf-sheet-meta">
              <span>
                Fund <strong>{formatPhp(selectedFund.fund_amount)}</strong>
              </span>
              <span>
                Period expenses <strong>{formatPhp(periodTotals.expense)}</strong>
              </span>
              <span>
                Balance this period <strong>{formatPhp(periodTotals.closing)}</strong>
              </span>
            </div>

            <div className="pcf-matrix-wrap">
              <table className="pcf-form-table pcf-matrix">
                <thead>
                  <tr>
                    <th rowSpan={2} className="pcf-matrix-date">
                      DATE
                    </th>
                    <th rowSpan={2}>PCV#</th>
                    <th rowSpan={2}>DESCRIPTION</th>
                    <th colSpan={PCF_CLASSIFICATIONS.length}>ACCOUNT CLASSIFICATION</th>
                    <th rowSpan={2}>AMOUNT</th>
                  </tr>
                  <tr>
                    {PCF_CLASSIFICATIONS.map((classification) => (
                      <th key={classification} className="pcf-matrix-cat">
                        <span>{classification}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liquidationRows.map(({ voucher, classification, amount, showDate }) => (
                    <tr key={voucher.id}>
                      <td className="pcf-matrix-date">{showDate ? sheetDate(voucher.voucher_date) : ''}</td>
                      <td className="pcf-cell-ref">{voucherRef(voucher)}</td>
                      <td className="pcf-matrix-desc">
                        {voucher.payee}
                        {voucher.receipt_path ? (
                          <button
                            type="button"
                            className="pcf-receipt-link no-print"
                            onClick={() => void openReceipt(voucher.receipt_path!)}
                          >
                            receipt
                          </button>
                        ) : null}
                      </td>
                      {PCF_CLASSIFICATIONS.map((c) => (
                        <td key={c} className="pcf-num">
                          {c === classification ? formatAmount(amount) : ''}
                        </td>
                      ))}
                      <td className="pcf-num pcf-strong">{formatAmount(amount)}</td>
                    </tr>
                  ))}
                  {liquidationRows.length === 0 ? (
                    <tr>
                      <td colSpan={3 + PCF_CLASSIFICATIONS.length} className="muted">
                        No vouchers in this period.
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td colSpan={3} className="pcf-right pcf-strong">
                      TOTAL
                    </td>
                    {PCF_CLASSIFICATIONS.map((c) => {
                      const total = classTotals.get(c) ?? 0
                      return (
                        <td key={c} className="pcf-num pcf-strong">
                          {total ? formatAmount(total) : ''}
                        </td>
                      )
                    })}
                    <td className="pcf-num pcf-strong">{formatAmount(periodTotals.expense)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

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

      {canManage && selectedFund ? (
        <Modal
          open={voucherOpen}
          onClose={() => setVoucherOpen(false)}
          title="New expense"
          subtitle="Petty cash paid out — attach the receipt photo or PDF."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoucherOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="pcf-voucher-form">
                Save expense
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
                {PCF_CLASSIFICATIONS.map((c) => (
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
            <Field
              label="Attachment (receipt)"
              htmlFor="pcf-v-file"
              hint="Photo or PDF · kept with this expense"
            >
              <div className="pcf-attach">
                <input
                  key={vFileKey}
                  id="pcf-v-file"
                  className="pcf-attach-input"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setVFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor="pcf-v-file" className="pcf-attach-btn">
                  {vFile ? 'Replace' : 'Choose file'}
                </label>
                <span className={`pcf-attach-name${vFile ? '' : ' is-empty'}`}>
                  {vFile ? vFile.name : 'No file chosen'}
                </span>
                {vFile ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setVFile(null)
                      setVFileKey((k) => k + 1)
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </Field>
          </form>
        </Modal>
      ) : null}

      {canManage && selectedFund && openPeriod ? (
        <Modal
          open={cutOpen}
          onClose={() => setCutOpen(false)}
          title="End current expense sheet"
          subtitle={`${openPeriod.label} · ${currentPeriodVouchers.length} entr${currentPeriodVouchers.length === 1 ? 'y' : 'ies'} · ${formatPhp(currentPeriodTotal)}`}
          size="sm"
          busy={cutSaving}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCutOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="pcf-cut-form" loading={cutSaving}>
                End sheet
              </Button>
            </>
          }
        >
          <form id="pcf-cut-form" className="stack" onSubmit={onCutSubmit}>
            <div className="pcf-cut-summary">
              <div>
                <span>Entries</span>
                <strong>{currentPeriodVouchers.length}</strong>
              </div>
              <div>
                <span>Sheet total</span>
                <strong>{formatPhp(currentPeriodTotal)}</strong>
              </div>
              <div>
                <span>To replenish</span>
                <strong>{formatPhp(unrecoveredTotal)}</strong>
              </div>
            </div>
            <Field label="Sheet name" htmlFor="pcf-cut-label">
              <TextInput
                id="pcf-cut-label"
                required
                value={cutLabel}
                onChange={(e) => setCutLabel(e.target.value)}
                placeholder="NOV 15"
              />
            </Field>
            <Field label="Notes" htmlFor="pcf-cut-notes" hint="Replenishment reference, refund, etc.">
              <TextArea
                id="pcf-cut-notes"
                value={cutNotes}
                onChange={(e) => setCutNotes(e.target.value)}
              />
            </Field>
            <p className="pcf-cut-warning">
              Record the replenishment or refund on the Replenishments tab first. Ending the sheet keeps
              all of its expenses in history and opens a new empty sheet for the next expenses.
            </p>
          </form>
        </Modal>
      ) : null}

      {historyPeriod ? (
        <Modal
          open
          onClose={() => setHistoryPeriod(null)}
          title={`Sheet ${historyPeriod.label}`}
          subtitle={`${formatDate(historyPeriod.start_date)} – ${formatDate(historyPeriod.end_date ?? historyPeriod.start_date)} · ${historyPeriod.voucher_count} entr${historyPeriod.voucher_count === 1 ? 'y' : 'ies'} · ${formatPhp(historyPeriod.total)}`}
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setHistoryPeriod(null)}>
              Close
            </Button>
          }
        >
          {historyPeriod.notes ? <p className="faint">{historyPeriod.notes}</p> : null}
          {historyVouchers.length === 0 ? (
            <div className="empty-state">This sheet has no expenses.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>PCV#</th>
                  <th>Description</th>
                  <th>Classification</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {historyVouchers.map((v) => (
                  <tr key={v.id}>
                    <td>{formatDate(v.voucher_date)}</td>
                    <td className="pcf-cell-ref">{voucherRef(v)}</td>
                    <td className="pcf-cell-primary">{v.payee}</td>
                    <td>{pcfClassification(v.category)}</td>
                    <td className="pcf-cell-amount">{formatPhp(v.amount)}</td>
                    <td>{receiptCell(v)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>
                    <strong>Total</strong>
                  </td>
                  <td className="pcf-cell-amount">
                    <strong>{formatPhp(historyPeriod.total)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </Table>
          )}
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

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onReceiptPicked(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
