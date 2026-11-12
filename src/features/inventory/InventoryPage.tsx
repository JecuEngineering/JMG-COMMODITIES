import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
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

type TabId = 'on_hand' | 'stock_in' | 'adjustments' | 'stock_card' | 'repack' | 'transfers'

const TABS: { id: TabId; label: string }[] = [
  { id: 'on_hand', label: 'On hand' },
  { id: 'stock_in', label: 'Stock in' },
  { id: 'adjustments', label: 'Adjust' },
  { id: 'stock_card', label: 'Stock card' },
  { id: 'repack', label: 'Repack' },
  { id: 'transfers', label: 'Transfers' },
]

export function InventoryPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewInventory(role)
  const canCreate = canCreateStockOps(role)
  const canApprove = canApproveStockOps(role)
  const canAllBranches = canViewAllBranchesInventory(role)
  const profileBranchId = user!.profile.branch_id

  const [tab, setTab] = useState<TabId>('on_hand')
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

  const lowStock = useMemo(() => balances.filter((r) => r.is_low && r.on_hand >= 0), [balances])

  function exportStock() {
    downloadCsv(
      `stock-on-hand-${todayInputValue()}.csv`,
      ['Branch', 'Variety', 'Sack size (kg)', 'Barcode', 'On hand', 'Status'],
      balances.map((row) => [
        row.branch_name,
        row.variety_name,
        row.sack_size,
        row.barcode ?? '',
        row.on_hand,
        row.is_low ? 'Low' : 'OK',
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
    if (tab === 'stock_card' && cardBranch && cardSku) void loadCard()
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

  async function onStockIn(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
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
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onAdjustment(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
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
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCreateTransfer(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    clearFlash()
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
      await loadCore()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <p>Stock is the sum of ledger movements — never edited as a raw count.</p>
        </div>
      </div>

      <ChipRow>
        {TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      {canAllBranches && (tab === 'on_hand' || tab === 'adjustments') ? (
        <Field label="Branch filter" htmlFor="inv-branch-filter">
          <SelectInput
            id="inv-branch-filter"
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
        </Field>
      ) : null}

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {loading ? <SkeletonTable rows={6} cols={5} /> : null}

      {tab === 'on_hand' ? (
        <div className="stack">
          {lowStock.length > 0 ? (
            <Card title="Low-stock alerts" subtitle={`Reorder level default / per SKU · ${lowStock.length} items`}>
              <Table>
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>SKU</th>
                    <th>On hand</th>
                    <th>Reorder at</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((row) => (
                    <tr key={`${row.branch_id}-${row.sku_id}-low`}>
                      <td>{row.branch_name}</td>
                      <td>
                        {row.variety_name} · {row.sack_size}kg
                      </td>
                      <td>{row.on_hand}</td>
                      <td>{row.reorder_level}</td>
                      <td>
                        <Badge tone="warning">Low</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}

          <Card
            title="Stock on hand"
            subtitle="Computed from stock_movements"
            action={
              balances.length > 0 ? (
                <Button variant="secondary" onClick={exportStock}>
                  Export CSV
                </Button>
              ) : undefined
            }
          >
            {balances.length === 0 ? (
              <div className="empty-state">No SKUs yet. Add products in Phase 2, then post stock in.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>SKU</th>
                    <th>Barcode</th>
                    <th>On hand</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((row) => (
                    <tr key={`${row.branch_id}-${row.sku_id}`}>
                      <td>{row.branch_name}</td>
                      <td>
                        {row.variety_name} · {row.sack_size}kg
                      </td>
                      <td>{row.barcode ?? '—'}</td>
                      <td>{row.on_hand}</td>
                      <td>
                        <Badge tone={row.is_low ? 'warning' : 'default'}>
                          {row.is_low ? 'Low' : 'OK'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'stock_in' ? (
        <Card title="Stock in" subtitle={canCreate ? 'Posts a positive ledger movement' : 'View only'}>
          {canCreate ? (
            <form className="stack" onSubmit={onStockIn}>
              <Field label="Branch" htmlFor="si-branch">
                <SelectInput
                  id="si-branch"
                  required
                  value={siBranch}
                  onChange={(e) => setSiBranch(e.target.value)}
                  disabled={!canAllBranches && !canCreate}
                >
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="SKU" htmlFor="si-sku">
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
              <Button type="submit">Post stock in</Button>
            </form>
          ) : (
            <p className="muted">Cashiers can view stock but cannot post stock in.</p>
          )}
        </Card>
      ) : null}

      {tab === 'adjustments' ? (
        <div className="stack">
          <Card
            title="Stock adjustment"
            subtitle="Use + for found stock, − for shortage. Warehouse requests need approval."
          >
            {canCreate ? (
              <form className="stack" onSubmit={onAdjustment}>
                <Field label="Branch" htmlFor="adj-branch">
                  <SelectInput
                    id="adj-branch"
                    required
                    value={adjBranch}
                    onChange={(e) => setAdjBranch(e.target.value)}
                  >
                    {branchOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="SKU" htmlFor="adj-sku">
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
                <Button type="submit">
                  {role === 'warehouse' ? 'Submit for approval' : 'Post adjustment'}
                </Button>
              </form>
            ) : (
              <p className="muted">Your role cannot create adjustments.</p>
            )}
          </Card>

          <Card title="Adjustment queue" subtitle="Pending approvals and history">
            {adjustments.length === 0 ? (
              <div className="empty-state">No adjustments yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Branch / SKU</th>
                    <th>Qty</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((adj) => (
                    <tr key={adj.id}>
                      <td>{formatDateTime(adj.created_at)}</td>
                      <td>
                        {adj.branch?.name}
                        <div className="faint">
                          {adj.sku ? skuLabel(adj.sku) : adj.sku_id}
                        </div>
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
          </Card>
        </div>
      ) : null}

      {tab === 'stock_card' ? (
        <Card title="Stock card" subtitle="Movement history for one SKU at one branch">
          <div className="stack">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <Field label="Branch" htmlFor="card-branch">
                  <SelectInput
                    id="card-branch"
                    value={cardBranch}
                    onChange={(e) => setCardBranch(e.target.value)}
                  >
                    {(canAllBranches ? branches : branchOptions).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Field label="SKU" htmlFor="card-sku">
                  <SelectInput id="card-sku" value={cardSku} onChange={(e) => setCardSku(e.target.value)}>
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {skuLabel(s)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <Button type="button" variant="secondary" onClick={() => void loadCard()}>
                Refresh
              </Button>
            </div>

            {cardRunning.length === 0 ? (
              <div className="empty-state">No movements for this SKU at this branch.</div>
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
                  {cardRunning.map((m) => (
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
          </div>
        </Card>
      ) : null}

      {tab === 'repack' ? (
        <Card
          title="Repacking"
          subtitle="Input sacks leave stock (repack_out); output sacks enter (repack_in). Weight lost is recorded."
        >
          {canCreate ? (
            <form className="stack" onSubmit={onRepack}>
              <Field label="Branch" htmlFor="rp-branch">
                <SelectInput id="rp-branch" value={rpBranch} onChange={(e) => setRpBranch(e.target.value)}>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Date" htmlFor="rp-date">
                <TextInput id="rp-date" type="date" value={rpDate} onChange={(e) => setRpDate(e.target.value)} />
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
              {rpInWeight && rpOutWeight ? (
                <p className="muted">
                  Weight lost: {(Number(rpInWeight) - Number(rpOutWeight)).toFixed(3)} kg
                </p>
              ) : null}
              <Field label="Input SKU (stock out)" htmlFor="rp-out-sku">
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
              <Field label="Output SKU (stock in)" htmlFor="rp-in-sku">
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
              <Button type="submit">Post repack</Button>
            </form>
          ) : (
            <p className="muted">Your role cannot post repacking.</p>
          )}
        </Card>
      ) : null}

      {tab === 'transfers' ? (
        <div className="stack">
          <Card title="Branch transfer" subtitle="Ship deducts stock (in transit). Receive adds stock at destination.">
            {canCreate ? (
              <form className="stack" onSubmit={onCreateTransfer}>
                <Field label="From branch" htmlFor="tr-from">
                  <SelectInput id="tr-from" required value={trFrom} onChange={(e) => setTrFrom(e.target.value)}>
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
                <Field label="SKU" htmlFor="tr-sku">
                  <SelectInput id="tr-sku" required value={trSku} onChange={(e) => setTrSku(e.target.value)}>
                    <option value="">Select SKU</option>
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
                <Button type="submit">Create & ship</Button>
              </form>
            ) : (
              <p className="muted">Your role cannot create transfers.</p>
            )}
          </Card>

          <Card title="Transfer list" subtitle="In-transit items await receiving at the destination branch">
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
                    <div
                      key={tr.id}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
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
                      <ul style={{ margin: '10px 0', paddingLeft: 18 }}>
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
        </div>
      ) : null}
    </div>
  )
}
