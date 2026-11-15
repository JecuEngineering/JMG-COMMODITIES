import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { formatDate, formatDateTime, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import {
  canApproveStockOps,
  canCreateStockOps,
  canViewAllBranchesInventory,
  canViewInventory,
} from '../../lib/roles'
import type { Branch, Sku, StockAdjustment, StockMovement, Transfer } from '../../types/database'
import {
  createTransfer,
  fetchAdjustments,
  fetchBranches,
  fetchSkus,
  fetchStockBalances,
  fetchStockCard,
  fetchTransfers,
  postRepacking,
  postStockIn,
  receiveTransfer,
  requestAdjustment,
  reviewAdjustment,
  shipTransfer,
  skuLabel,
  type StockBalanceRow,
} from './inventoryApi'
import './inventory.css'

type TabId = 'stock' | 'movements' | 'transfers' | 'repacking' | 'adjustments'
type StockAction = 'receive' | 'repack' | 'transfer' | 'adjust'
type StatusFilter = 'all' | 'ok' | 'low' | 'out'

const TABS: { id: TabId; label: string }[] = [
  { id: 'stock', label: 'Stock' },
  { id: 'movements', label: 'Movements' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'repacking', label: 'Repacking' },
  { id: 'adjustments', label: 'Adjustments' },
]

function fmtQty(value: number) {
  return value.toLocaleString('en-PH', { maximumFractionDigits: 2 })
}

export function InventoryPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewInventory(role)
  const canCreate = canCreateStockOps(role)
  const canApprove = canApproveStockOps(role)
  const canAllBranches = canViewAllBranchesInventory(role)
  const profileBranchId = user!.profile.branch_id

  const [tab, setTab] = useState<TabId>('stock')
  const [branches, setBranches] = useState<Branch[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [balances, setBalances] = useState<StockBalanceRow[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [cardMoves, setCardMoves] = useState<StockMovement[]>([])
  const [branchFilter, setBranchFilter] = useState(profileBranchId ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Stock actions dropdown + modals
  const [actionsOpen, setActionsOpen] = useState(false)
  const [action, setAction] = useState<StockAction | null>(null)
  const [saving, setSaving] = useState(false)
  const [rowAction, setRowAction] = useState<StockBalanceRow | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Stock list filters
  const [stockSearch, setStockSearch] = useState('')
  const [varietyFilter, setVarietyFilter] = useState('all')
  const [sizeFilter, setSizeFilter] = useState<'all' | number>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  // Stock in form
  const [siSku, setSiSku] = useState('')
  const [siQty, setSiQty] = useState('')
  const [siNote, setSiNote] = useState('')
  const [siBranch, setSiBranch] = useState(profileBranchId ?? '')

  // Adjustment form
  const [adjSku, setAdjSku] = useState('')
  const [adjQty, setAdjQty] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjBranch, setAdjBranch] = useState(profileBranchId ?? '')

  // Stock card
  const [cardBranch, setCardBranch] = useState(profileBranchId ?? '')
  const [cardSku, setCardSku] = useState('')

  // Repack
  const [rpBranch, setRpBranch] = useState(profileBranchId ?? '')
  const [rpDate, setRpDate] = useState(todayInputValue())
  const [rpInWeight, setRpInWeight] = useState('')
  const [rpOutWeight, setRpOutWeight] = useState('')
  const [rpReason, setRpReason] = useState('')
  const [rpOutSku, setRpOutSku] = useState('')
  const [rpOutSacks, setRpOutSacks] = useState('')
  const [rpInSku, setRpInSku] = useState('')
  const [rpInSacks, setRpInSacks] = useState('')

  // Transfer
  const [trFrom, setTrFrom] = useState(profileBranchId ?? '')
  const [trTo, setTrTo] = useState('')
  const [trNotes, setTrNotes] = useState('')
  const [trSku, setTrSku] = useState('')
  const [trSacks, setTrSacks] = useState('')
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})

  const effectiveBranchFilter = canAllBranches ? branchFilter || null : profileBranchId

  const loadCore = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, s, bal, adj, tr] = await Promise.all([
        fetchBranches(),
        fetchSkus(),
        fetchStockBalances(effectiveBranchFilter),
        fetchAdjustments(effectiveBranchFilter),
        fetchTransfers(),
      ])
      setBranches(b)
      setSkus(s)
      setBalances(bal)
      setAdjustments(adj)
      setTransfers(tr)

      const defaultBranch = profileBranchId || b[0]?.id || ''
      setSiBranch((prev) => prev || defaultBranch)
      setAdjBranch((prev) => prev || defaultBranch)
      setCardBranch((prev) => prev || defaultBranch)
      setRpBranch((prev) => prev || defaultBranch)
      setTrFrom((prev) => prev || defaultBranch)
      setCardSku((prev) => prev || s[0]?.id || '')
      setSiSku((prev) => prev || s[0]?.id || '')
      setAdjSku((prev) => prev || s[0]?.id || '')
      setRpOutSku((prev) => prev || s.find((x) => x.sack_size === 50)?.id || s[0]?.id || '')
      setRpInSku((prev) => prev || s.find((x) => x.sack_size === 25)?.id || s[0]?.id || '')
      setTrSku((prev) => prev || s[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [effectiveBranchFilter, profileBranchId])

  useEffect(() => {
    if (canView) void loadCore()
  }, [canView, loadCore])

  useEffect(() => {
    if (!actionsOpen) return
    function onPointerDown(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setActionsOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActionsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [actionsOpen])

  const stats = useMemo(() => {
    let sacks = 0
    let weight = 0
    let low = 0
    let out = 0
    for (const row of balances) {
      sacks += row.on_hand
      weight += row.on_hand * row.sack_size
      if (row.on_hand <= 0) out += 1
      else if (row.is_low) low += 1
    }
    return { sacks, weight, low, out }
  }, [balances])

  const pendingAdjustments = useMemo(
    () => adjustments.filter((row) => row.status === 'pending').length,
    [adjustments],
  )

  const varietyOptions = useMemo(
    () => Array.from(new Set(balances.map((row) => row.variety_name))).sort(),
    [balances],
  )

  const sizeOptions = useMemo(
    () => Array.from(new Set(balances.map((row) => row.sack_size))).sort((a, b) => a - b),
    [balances],
  )

  const filteredBalances = useMemo(() => {
    const query = stockSearch.trim().toLowerCase()
    return balances.filter((row) => {
      if (query) {
        const haystack =
          `${row.variety_name} ${row.sack_size} ${row.barcode ?? ''} ${row.branch_name}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (varietyFilter !== 'all' && row.variety_name !== varietyFilter) return false
      if (sizeFilter !== 'all' && row.sack_size !== sizeFilter) return false
      if (statusFilter === 'out' && row.on_hand > 0) return false
      if (statusFilter === 'low' && !(row.is_low && row.on_hand > 0)) return false
      if (statusFilter === 'ok' && row.is_low) return false
      return true
    })
  }, [balances, stockSearch, varietyFilter, sizeFilter, statusFilter])

  function exportStock() {
    downloadCsv(
      `stock-on-hand-${todayInputValue()}.csv`,
      ['Branch', 'Variety', 'Sack size (kg)', 'Barcode', 'On hand', 'Weight (kg)', 'Reorder at', 'Status'],
      balances.map((row) => [
        row.branch_name,
        row.variety_name,
        row.sack_size,
        row.barcode ?? '',
        row.on_hand,
        row.on_hand * row.sack_size,
        row.reorder_level,
        row.on_hand <= 0 ? 'Out' : row.is_low ? 'Low' : 'OK',
      ]),
    )
  }

  const cardRunning = useMemo(() => {
    const chronological = [...cardMoves].reverse()
    let running = 0
    const withBalance = chronological.map((m) => {
      running += Number(m.quantity)
      return { ...m, running }
    })
    return withBalance.reverse()
  }, [cardMoves])

  const balancePager = usePaged(filteredBalances, 25)
  const movementPager = usePaged(cardRunning, 25)
  const adjustmentPager = usePaged(adjustments, 10)

  async function loadCard() {
    if (!cardBranch || !cardSku) return
    try {
      const moves = await fetchStockCard(cardBranch, cardSku)
      setCardMoves(moves)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (tab === 'movements' && cardBranch && cardSku) void loadCard()
  }, [tab, cardBranch, cardSku])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to inventory.</div>
      </div>
    )
  }

  function clearFlash() {
    setError(null)
    setMessage(null)
  }

  function openAction(kind: StockAction) {
    clearFlash()
    setActionsOpen(false)
    setAction(kind)
  }

  function closeAction() {
    if (saving) return
    setAction(null)
  }

  function openMovements(row: StockBalanceRow) {
    setCardBranch(row.branch_id)
    setCardSku(row.sku_id)
    setTab('movements')
  }

  function openAdjustFor(row: StockBalanceRow) {
    setAdjBranch(row.branch_id)
    setAdjSku(row.sku_id)
    setRowAction(null)
    openAction('adjust')
  }

  async function onStockIn(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
    setSaving(true)
    try {
      await postStockIn({
        branchId: siBranch,
        skuId: siSku,
        quantity: Number(siQty),
        note: siNote.trim() || undefined,
      })
      setMessage('Stock in posted to the ledger.')
      setSiQty('')
      setSiNote('')
      setAction(null)
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onAdjustment(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
    setSaving(true)
    try {
      await requestAdjustment({
        branchId: adjBranch,
        skuId: adjSku,
        quantity: Number(adjQty),
        reason: adjReason.trim(),
      })
      setMessage(
        role === 'warehouse'
          ? 'Adjustment submitted for Branch Accountant / Owner approval.'
          : 'Adjustment approved and posted to the ledger.',
      )
      setAdjQty('')
      setAdjReason('')
      setAction(null)
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onReview(adj: StockAdjustment, approve: boolean) {
    clearFlash()
    try {
      await reviewAdjustment(adj.id, approve)
      setMessage(approve ? 'Adjustment approved.' : 'Adjustment rejected.')
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRepack(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
    setSaving(true)
    try {
      await postRepacking({
        branchId: rpBranch,
        repackDate: rpDate,
        inputWeightKg: Number(rpInWeight),
        outputWeightKg: Number(rpOutWeight),
        reason: rpReason.trim() || undefined,
        lines: [
          { sku_id: rpOutSku, direction: 'out', sacks: Number(rpOutSacks) },
          { sku_id: rpInSku, direction: 'in', sacks: Number(rpInSacks) },
        ],
      })
      setMessage(
        `Repack posted. Weight lost: ${(Number(rpInWeight) - Number(rpOutWeight)).toFixed(3)} kg.`,
      )
      setRpOutSacks('')
      setRpInSacks('')
      setAction(null)
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onCreateTransfer(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
    setSaving(true)
    try {
      const id = await createTransfer({
        fromBranchId: trFrom,
        toBranchId: trTo,
        notes: trNotes.trim() || undefined,
        lines: [{ sku_id: trSku, sacks_sent: Number(trSacks) }],
      })
      await shipTransfer(id)
      setMessage('Transfer shipped — stock out recorded, status In transit.')
      setTrSacks('')
      setTrNotes('')
      setAction(null)
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function onReceive(transfer: Transfer) {
    if (!canCreate || !transfer.lines?.length) return
    clearFlash()
    try {
      const lines = transfer.lines.map((line) => ({
        sku_id: line.sku_id,
        sacks_received: Number(receiveQty[line.id] ?? line.sacks_sent),
      }))
      await receiveTransfer(transfer.id, lines)
      setMessage('Transfer received — stock in recorded.')
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const branchOptions = canAllBranches
    ? branches
    : branches.filter((b) => b.id === profileBranchId)

  function branchLabel(id: string) {
    return branches.find((b) => b.id === id)?.name ?? '—'
  }

  function skuFor(id: string) {
    return skus.find((s) => s.id === id)
  }

  function onHandAt(branchId: string, skuId: string) {
    return balances.find((row) => row.branch_id === branchId && row.sku_id === skuId)?.on_hand ?? 0
  }

  const receiveAside = (
    <div className="inv-summary">
      <div className="inv-summary-block">
        <span className="inv-summary-label">Posting to</span>
        <strong>{branchLabel(siBranch)}</strong>
        <span className="faint">{skuFor(siSku) ? skuLabel(skuFor(siSku)!) : 'Select a rice variety'}</span>
      </div>
      <div className="inv-summary-rows">
        <div className="inv-summary-row">
          <span>On hand now</span>
          <span>{fmtQty(onHandAt(siBranch, siSku))} sack(s)</span>
        </div>
        <div className="inv-summary-row">
          <span>Receiving</span>
          <span>{fmtQty(Number(siQty) || 0)} sack(s)</span>
        </div>
      </div>
      <div className="inv-summary-total">
        <span>New on hand</span>
        <span>{fmtQty(onHandAt(siBranch, siSku) + (Number(siQty) || 0))}</span>
      </div>
      <p className="inv-summary-note">
        Stock enters the ledger as a stock_in movement. Balances are always derived from movements.
      </p>
    </div>
  )

  const adjustAside = (
    <div className="inv-summary">
      <div className="inv-summary-block">
        <span className="inv-summary-label">Adjusting</span>
        <strong>{branchLabel(adjBranch)}</strong>
        <span className="faint">{skuFor(adjSku) ? skuLabel(skuFor(adjSku)!) : 'Select a rice variety'}</span>
      </div>
      <div className="inv-summary-rows">
        <div className="inv-summary-row">
          <span>On hand now</span>
          <span>{fmtQty(onHandAt(adjBranch, adjSku))} sack(s)</span>
        </div>
        <div className="inv-summary-row">
          <span>Change</span>
          <span>
            {adjQty && Number(adjQty) > 0 ? '+' : ''}
            {adjQty ? fmtQty(Number(adjQty)) : '—'}
          </span>
        </div>
      </div>
      <div className="inv-summary-total">
        <span>New on hand</span>
        <span>{fmtQty(onHandAt(adjBranch, adjSku) + (Number(adjQty) || 0))}</span>
      </div>
      <p className="inv-summary-note">
        {role === 'warehouse'
          ? 'Warehouse requests need Branch Accountant or Owner approval before they touch stock.'
          : 'Approved adjustments post to the ledger immediately.'}
      </p>
    </div>
  )

  const repackWeightLost =
    rpInWeight && rpOutWeight ? (Number(rpInWeight) - Number(rpOutWeight)).toFixed(3) : '—'

  const repackAside = (
    <div className="inv-summary">
      <div className="inv-summary-block">
        <span className="inv-summary-label">Repacking at</span>
        <strong>{branchLabel(rpBranch)}</strong>
        <span className="faint">{rpDate}</span>
      </div>
      <div className="inv-summary-rows">
        <div className="inv-summary-row">
          <span>Input weight</span>
          <span>{rpInWeight ? `${fmtQty(Number(rpInWeight))} kg` : '—'}</span>
        </div>
        <div className="inv-summary-row">
          <span>Output weight</span>
          <span>{rpOutWeight ? `${fmtQty(Number(rpOutWeight))} kg` : '—'}</span>
        </div>
        <div className="inv-summary-row">
          <span>Input sacks</span>
          <span>{rpOutSacks || '—'}</span>
        </div>
        <div className="inv-summary-row">
          <span>Output sacks</span>
          <span>{rpInSacks || '—'}</span>
        </div>
      </div>
      <div className="inv-summary-total">
        <span>Weight lost</span>
        <span>{repackWeightLost} kg</span>
      </div>
      <p className="inv-summary-note">
        Input sacks leave stock (repack_out); output sacks enter (repack_in). Weight lost is recorded
        for shrinkage.
      </p>
    </div>
  )

  const transferAside = (
    <div className="inv-summary">
      <div className="inv-summary-block">
        <span className="inv-summary-label">Route</span>
        <strong>
          {branchLabel(trFrom)} → {trTo ? branchLabel(trTo) : 'Destination'}
        </strong>
        <span className="faint">{skuFor(trSku) ? skuLabel(skuFor(trSku)!) : 'Select a rice variety'}</span>
      </div>
      <div className="inv-summary-rows">
        <div className="inv-summary-row">
          <span>On hand at source</span>
          <span>{fmtQty(onHandAt(trFrom, trSku))} sack(s)</span>
        </div>
        <div className="inv-summary-row">
          <span>Sending</span>
          <span>{trSacks ? `${trSacks} sack(s)` : '—'}</span>
        </div>
      </div>
      <p className="inv-summary-note">
        Creating the transfer ships it immediately: stock leaves the source branch and stays in transit
        until the destination confirms receipt.
      </p>
    </div>
  )

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Stock is the sum of ledger movements — never edited as a raw count.</p>
        </div>
        <div className="inv-toolbar">
          {canAllBranches ? (
            <SelectInput
              aria-label="Branch filter"
              className="inv-branch-pick"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          ) : (
            <span className="inv-branch-label">{branchLabel(profileBranchId ?? '')}</span>
          )}
          {canCreate ? (
            <div className="inv-actions" ref={actionsRef}>
              <Button
                onClick={() => setActionsOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={actionsOpen}
              >
                Stock actions <span aria-hidden="true">▾</span>
              </Button>
              {actionsOpen ? (
                <div className="inv-actions-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => openAction('receive')}>
                    <strong>Receive stock</strong>
                    <span>Post a stock-in movement</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => openAction('repack')}>
                    <strong>Post repack</strong>
                    <span>Split sacks, record shrinkage</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => openAction('transfer')}>
                    <strong>Transfer stock</strong>
                    <span>Send sacks between branches</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => openAction('adjust')}>
                    <strong>Adjust stock</strong>
                    <span>Found stock or shortage</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="inv-stats">
        <div className="inv-stat">
          <span className="inv-stat-label">Sacks on hand</span>
          <strong className="inv-stat-value">{fmtQty(stats.sacks)}</strong>
          <span className="inv-stat-sub">
            Across {balances.length} stock line{balances.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="inv-stat">
          <span className="inv-stat-label">Total weight</span>
          <strong className="inv-stat-value">{fmtQty(stats.weight)} kg</strong>
          <span className="inv-stat-sub">Sacks × sack size</span>
        </div>
        <div className="inv-stat inv-stat-warning">
          <span className="inv-stat-label">Low stock</span>
          <strong className="inv-stat-value">{fmtQty(stats.low)}</strong>
          <span className="inv-stat-sub">At or below reorder level</span>
        </div>
        <div className="inv-stat inv-stat-danger">
          <span className="inv-stat-label">Out of stock</span>
          <strong className="inv-stat-value">{fmtQty(stats.out)}</strong>
          <span className="inv-stat-sub">Zero or negative on hand</span>
        </div>
      </div>

      <nav className="inv-tabs" aria-label="Inventory views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`inv-tab ${tab === t.id ? 'is-active' : ''}`.trim()}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'adjustments' && pendingAdjustments > 0 ? (
              <span className="inv-tab-count">{pendingAdjustments}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {error && !action && !rowAction ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {loading ? <SkeletonTable rows={6} cols={6} /> : null}

      {tab === 'stock' ? (
        <Card
          title="Stock on hand"
          subtitle={`${filteredBalances.length} of ${balances.length} lines`}
          action={
            balances.length > 0 ? (
              <Button variant="secondary" onClick={exportStock}>
                Export CSV
              </Button>
            ) : undefined
          }
        >
          {balances.length === 0 ? (
            <div className="empty-state">No rice varieties yet. Add products, then post stock in.</div>
          ) : (
            <div className="stack">
              <div className="inv-filters">
                <TextInput
                  className="inv-search"
                  aria-label="Search stock"
                  placeholder="Search variety, size or barcode"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
                <SelectInput
                  className="inv-filter-select"
                  aria-label="Variety filter"
                  value={varietyFilter}
                  onChange={(e) => setVarietyFilter(e.target.value)}
                >
                  <option value="all">All varieties</option>
                  {varietyOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </SelectInput>
                <ChipRow>
                  <Chip active={sizeFilter === 'all'} onClick={() => setSizeFilter('all')}>
                    All sizes
                  </Chip>
                  {sizeOptions.map((size) => (
                    <Chip
                      key={size}
                      active={sizeFilter === size}
                      onClick={() => setSizeFilter(size)}
                    >
                      {size}kg
                    </Chip>
                  ))}
                </ChipRow>
                <SelectInput
                  className="inv-filter-select"
                  aria-label="Status filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="all">All status</option>
                  <option value="ok">In stock</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                </SelectInput>
              </div>

              {filteredBalances.length === 0 ? (
                <div className="empty-state">No stock lines match these filters.</div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Variety</th>
                      <th>Size</th>
                      <th>On hand</th>
                      <th>Weight</th>
                      <th>Reorder at</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {balancePager.pageItems.map((row) => (
                      <tr key={`${row.branch_id}-${row.sku_id}`}>
                        <td>
                          <div className="inv-cell-primary">{row.variety_name}</div>
                          <div className="faint">
                            {row.barcode ?? '—'}
                            {canAllBranches && !branchFilter ? ` · ${row.branch_name}` : ''}
                          </div>
                        </td>
                        <td>{row.sack_size}kg</td>
                        <td>{fmtQty(row.on_hand)}</td>
                        <td>{fmtQty(row.on_hand * row.sack_size)} kg</td>
                        <td>{row.reorder_level}</td>
                        <td>
                          {row.on_hand <= 0 ? (
                            <Badge tone="danger">Out</Badge>
                          ) : row.is_low ? (
                            <Badge tone="warning">Low</Badge>
                          ) : (
                            <Badge>In stock</Badge>
                          )}
                        </td>
                        <td className="inv-cell-actions">
                          <Button
                            variant="ghost"
                            aria-label={`Actions for ${row.variety_name} ${row.sack_size}kg${
                              canAllBranches && !branchFilter ? ` at ${row.branch_name}` : ''
                            }`}
                            onClick={() => setRowAction(row)}
                          >
                            ⋯
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}

              <Pagination
                page={balancePager.page}
                pageCount={balancePager.pageCount}
                pageSize={balancePager.pageSize}
                total={balancePager.total}
                start={balancePager.start}
                end={balancePager.end}
                onPage={balancePager.setPage}
                onPageSize={balancePager.setPageSize}
                noun="stock line"
              />

              <p className="inv-footer-hint">
                Showing {filteredBalances.length} of {balances.length} stock lines · Low = at or below
                the reorder level · Out = zero or negative on hand.
              </p>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'movements' ? (
        <Card title="Stock card" subtitle="Movement history for one rice variety at one branch">
          <div className="stack">
            <div className="inv-filters">
              <SelectInput
                className="inv-filter-select"
                aria-label="Branch"
                value={cardBranch}
                onChange={(e) => setCardBranch(e.target.value)}
              >
                {(canAllBranches ? branches : branchOptions).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                className="inv-filter-select"
                aria-label="Rice variety"
                value={cardSku}
                onChange={(e) => setCardSku(e.target.value)}
              >
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {skuLabel(s)}
                  </option>
                ))}
              </SelectInput>
              <Button variant="secondary" onClick={() => void loadCard()}>
                Refresh
              </Button>
            </div>

            {cardRunning.length === 0 ? (
              <div className="empty-state">No movements for this rice variety at this branch.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Running</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {movementPager.pageItems.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.moved_at)}</td>
                      <td>{m.movement_type}</td>
                      <td>{m.quantity}</td>
                      <td>{m.running}</td>
                      <td>{m.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <Pagination
              page={movementPager.page}
              pageCount={movementPager.pageCount}
              pageSize={movementPager.pageSize}
              total={movementPager.total}
              start={movementPager.start}
              end={movementPager.end}
              onPage={movementPager.setPage}
              onPageSize={movementPager.setPageSize}
              noun="movement"
            />
          </div>
        </Card>
      ) : null}

      {tab === 'transfers' ? (
        <Card
          title="Transfer list"
          subtitle="In-transit items await receiving at the destination branch"
          action={
            canCreate ? <Button onClick={() => openAction('transfer')}>New transfer</Button> : undefined
          }
        >
          {transfers.length === 0 ? (
            <div className="empty-state">No transfers yet.</div>
          ) : (
            <div className="stack">
              {transfers.map((tr) => {
                const canReceiveHere =
                  canCreate &&
                  tr.status === 'in_transit' &&
                  (canAllBranches || tr.to_branch_id === profileBranchId)
                return (
                  <div key={tr.id} className="inv-transfer">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>
                          {tr.from_branch?.name ?? 'From'} → {tr.to_branch?.name ?? 'To'}
                        </strong>
                        <div className="faint">{formatDate(tr.created_at)}</div>
                      </div>
                      <Badge
                        tone={
                          tr.status === 'in_transit'
                            ? 'warning'
                            : tr.status === 'received'
                              ? 'default'
                              : 'muted'
                        }
                      >
                        {tr.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <ul className="inv-transfer-lines">
                      {tr.lines?.map((line) => (
                        <li key={line.id}>
                          {line.sku ? skuLabel(line.sku) : line.sku_id}: sent {line.sacks_sent}
                          {line.sacks_received != null ? ` · received ${line.sacks_received}` : ''}
                          {line.sacks_received != null &&
                          Number(line.sacks_received) !== Number(line.sacks_sent) ? (
                            <Badge tone="danger">Difference</Badge>
                          ) : null}
                          {canReceiveHere ? (
                            <div style={{ marginTop: 6, maxWidth: 160 }}>
                              <TextInput
                                aria-label={`Received sacks for ${line.sku_id}`}
                                placeholder={`Recv (default ${line.sacks_sent})`}
                                value={receiveQty[line.id] ?? ''}
                                onChange={(e) =>
                                  setReceiveQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                                }
                              />
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {canReceiveHere ? (
                      <Button onClick={() => void onReceive(tr)}>Confirm receive</Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'repacking' ? (
        <Card
          title="Repacking"
          subtitle="Input sacks leave stock (repack_out); output sacks enter (repack_in). Weight lost is recorded."
          action={canCreate ? <Button onClick={() => openAction('repack')}>Post repack</Button> : undefined}
        >
          <div className="inv-repack-info">
            <div>
              <strong>Move stock from large sacks into retail sizes</strong>
              <p className="muted">
                Each repack posts two ledger movements at the same branch: the input sacks are deducted
                and the output sacks are added. Any difference between input and output weight is
                logged as shrinkage so the loss is visible instead of silently disappearing.
              </p>
            </div>
            <ul className="inv-repack-list">
              <li>Input sack size — the larger sack leaving stock</li>
              <li>Output sack size — the smaller sack entering stock</li>
              <li>Input / output weight in kg — used to record weight lost</li>
            </ul>
          </div>
        </Card>
      ) : null}

      {tab === 'adjustments' ? (
        <Card
          title="Adjustment queue"
          subtitle="Pending approvals and history"
          action={
            canCreate ? <Button onClick={() => openAction('adjust')}>Adjust stock</Button> : undefined
          }
        >
          {adjustments.length === 0 ? (
            <div className="empty-state">No adjustments yet.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Branch / Rice variety</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {adjustmentPager.pageItems.map((adj) => (
                  <tr key={adj.id}>
                    <td>{formatDateTime(adj.created_at)}</td>
                    <td>
                      {adj.branch?.name}
                      <div className="faint">{adj.sku ? skuLabel(adj.sku) : adj.sku_id}</div>
                    </td>
                    <td>{adj.quantity}</td>
                    <td>{adj.reason}</td>
                    <td>
                      <Badge
                        tone={
                          adj.status === 'approved'
                            ? 'default'
                            : adj.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {adj.status}
                      </Badge>
                    </td>
                    <td>
                      {canApprove && adj.status === 'pending' ? (
                        <div className="row">
                          <Button onClick={() => void onReview(adj, true)}>Approve</Button>
                          <Button variant="danger" onClick={() => void onReview(adj, false)}>
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination
            page={adjustmentPager.page}
            pageCount={adjustmentPager.pageCount}
            pageSize={adjustmentPager.pageSize}
            total={adjustmentPager.total}
            start={adjustmentPager.start}
            end={adjustmentPager.end}
            onPage={adjustmentPager.setPage}
            onPageSize={adjustmentPager.setPageSize}
            noun="adjustment"
          />
        </Card>
      ) : null}

      <Modal
        open={action === 'receive'}
        onClose={closeAction}
        title="Receive stock"
        subtitle="Posts a positive ledger movement"
        size="lg"
        busy={saving}
        aside={receiveAside}
        footer={
          <>
            <Button variant="secondary" onClick={closeAction} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="stock-in-form" loading={saving}>
              Post stock in
            </Button>
          </>
        }
      >
        <form id="stock-in-form" className="stack" onSubmit={onStockIn}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="Branch" htmlFor="si-branch">
            <SelectInput
              id="si-branch"
              required
              value={siBranch}
              onChange={(e) => setSiBranch(e.target.value)}
              disabled={!canAllBranches}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Rice variety" htmlFor="si-sku">
            <SelectInput id="si-sku" required value={siSku} onChange={(e) => setSiSku(e.target.value)}>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {skuLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Sacks in" htmlFor="si-qty">
            <TextInput
              id="si-qty"
              required
              inputMode="decimal"
              value={siQty}
              onChange={(e) => setSiQty(e.target.value)}
              placeholder="100"
            />
          </Field>
          <Field label="Note" htmlFor="si-note">
            <TextInput id="si-note" value={siNote} onChange={(e) => setSiNote(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={action === 'adjust'}
        onClose={closeAction}
        title="Adjust stock"
        subtitle="Use + for found stock, − for shortage"
        size="lg"
        busy={saving}
        aside={adjustAside}
        footer={
          <>
            <Button variant="secondary" onClick={closeAction} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="adjustment-form" loading={saving}>
              {role === 'warehouse' ? 'Submit for approval' : 'Post adjustment'}
            </Button>
          </>
        }
      >
        <form id="adjustment-form" className="stack" onSubmit={onAdjustment}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="Branch" htmlFor="adj-branch">
            <SelectInput
              id="adj-branch"
              required
              value={adjBranch}
              onChange={(e) => setAdjBranch(e.target.value)}
              disabled={!canAllBranches}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Rice variety" htmlFor="adj-sku">
            <SelectInput id="adj-sku" required value={adjSku} onChange={(e) => setAdjSku(e.target.value)}>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {skuLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Quantity (+/−)" htmlFor="adj-qty" hint="Example: -3 or 2">
            <TextInput
              id="adj-qty"
              required
              value={adjQty}
              onChange={(e) => setAdjQty(e.target.value)}
              placeholder="-3"
            />
          </Field>
          <Field label="Reason" htmlFor="adj-reason">
            <TextArea
              id="adj-reason"
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Damaged sacks / count correction"
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={action === 'repack'}
        onClose={closeAction}
        title="Post repack"
        subtitle="Split larger sacks into retail sizes and record shrinkage"
        size="lg"
        busy={saving}
        aside={repackAside}
        footer={
          <>
            <Button variant="secondary" onClick={closeAction} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="repack-form" loading={saving}>
              Post repack
            </Button>
          </>
        }
      >
        <form id="repack-form" className="stack" onSubmit={onRepack}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="Branch" htmlFor="rp-branch">
            <SelectInput
              id="rp-branch"
              value={rpBranch}
              onChange={(e) => setRpBranch(e.target.value)}
              disabled={!canAllBranches}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Date" htmlFor="rp-date">
            <DateInput id="rp-date" value={rpDate} onChange={setRpDate} />
          </Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Field label="Input weight (kg)" htmlFor="rp-in-w">
                <TextInput
                  id="rp-in-w"
                  required
                  inputMode="decimal"
                  value={rpInWeight}
                  onChange={(e) => setRpInWeight(e.target.value)}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Output weight (kg)" htmlFor="rp-out-w">
                <TextInput
                  id="rp-out-w"
                  required
                  inputMode="decimal"
                  value={rpOutWeight}
                  onChange={(e) => setRpOutWeight(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <Field label="Input sack size (stock out)" htmlFor="rp-out-sku">
            <SelectInput id="rp-out-sku" required value={rpOutSku} onChange={(e) => setRpOutSku(e.target.value)}>
              <option value="">Select larger sack</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {skuLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Input sacks" htmlFor="rp-out-sacks">
            <TextInput
              id="rp-out-sacks"
              required
              value={rpOutSacks}
              onChange={(e) => setRpOutSacks(e.target.value)}
            />
          </Field>
          <Field label="Output sack size (stock in)" htmlFor="rp-in-sku">
            <SelectInput id="rp-in-sku" required value={rpInSku} onChange={(e) => setRpInSku(e.target.value)}>
              <option value="">Select smaller sack</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {skuLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Output sacks" htmlFor="rp-in-sacks">
            <TextInput
              id="rp-in-sacks"
              required
              value={rpInSacks}
              onChange={(e) => setRpInSacks(e.target.value)}
            />
          </Field>
          <Field label="Reason" htmlFor="rp-reason">
            <TextInput id="rp-reason" value={rpReason} onChange={(e) => setRpReason(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={action === 'transfer'}
        onClose={closeAction}
        title="New transfer"
        subtitle="Ship deducts stock (in transit). Receive adds stock at destination."
        size="lg"
        busy={saving}
        aside={transferAside}
        footer={
          <>
            <Button variant="secondary" onClick={closeAction} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="transfer-form" loading={saving}>
              Create &amp; ship
            </Button>
          </>
        }
      >
        <form id="transfer-form" className="stack" onSubmit={onCreateTransfer}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="From branch" htmlFor="tr-from">
            <SelectInput
              id="tr-from"
              required
              value={trFrom}
              onChange={(e) => setTrFrom(e.target.value)}
              disabled={!canAllBranches}
            >
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="To branch" htmlFor="tr-to">
            <SelectInput id="tr-to" required value={trTo} onChange={(e) => setTrTo(e.target.value)}>
              <option value="">Select destination</option>
              {branches
                .filter((b) => b.id !== trFrom)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </SelectInput>
          </Field>
          <Field label="Rice variety" htmlFor="tr-sku">
            <SelectInput id="tr-sku" required value={trSku} onChange={(e) => setTrSku(e.target.value)}>
              <option value="">Select rice variety</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {skuLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Sacks to send" htmlFor="tr-sacks">
            <TextInput
              id="tr-sacks"
              required
              value={trSacks}
              onChange={(e) => setTrSacks(e.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="tr-notes">
            <TextInput id="tr-notes" value={trNotes} onChange={(e) => setTrNotes(e.target.value)} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={rowAction !== null}
        onClose={() => setRowAction(null)}
        title={rowAction ? `${rowAction.variety_name} · ${rowAction.sack_size}kg` : 'Stock line'}
        subtitle={rowAction ? rowAction.branch_name : undefined}
        size="sm"
        footer={
          rowAction ? (
            <>
              <Button variant="secondary" onClick={() => setRowAction(null)}>
                Cancel
              </Button>
              {canCreate ? (
                <Button variant="secondary" onClick={() => openAdjustFor(rowAction)}>
                  Adjust stock
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  openMovements(rowAction)
                  setRowAction(null)
                }}
              >
                View movements
              </Button>
            </>
          ) : undefined
        }
      >
        {rowAction ? (
          <div className="inv-summary">
            <div className="inv-summary-rows inv-summary-rows-flat">
              <div className="inv-summary-row">
                <span>On hand</span>
                <strong>{fmtQty(rowAction.on_hand)} sack(s)</strong>
              </div>
              <div className="inv-summary-row">
                <span>Weight</span>
                <span>{fmtQty(rowAction.on_hand * rowAction.sack_size)} kg</span>
              </div>
              <div className="inv-summary-row">
                <span>Reorder at</span>
                <span>{rowAction.reorder_level} sack(s)</span>
              </div>
              <div className="inv-summary-row">
                <span>Barcode</span>
                <span>{rowAction.barcode ?? '—'}</span>
              </div>
              <div className="inv-summary-row">
                <span>Status</span>
                <span>
                  {rowAction.on_hand <= 0 ? (
                    <Badge tone="danger">Out</Badge>
                  ) : rowAction.is_low ? (
                    <Badge tone="warning">Low</Badge>
                  ) : (
                    <Badge>In stock</Badge>
                  )}
                </span>
              </div>
            </div>
            <p className="inv-summary-note">
              {canCreate
                ? 'View the movement ledger for this rice variety, or post a found-stock / shortage adjustment.'
                : 'View the movement ledger for this rice variety.'}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
