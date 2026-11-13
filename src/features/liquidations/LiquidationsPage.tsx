import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchFundRequests, type FundRequest } from '../fund-requests/fundRequestsApi'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import {
  canPrepareLiquidation,
  canViewAllBranchesFundRequests,
  canViewLiquidations,
} from '../../lib/roles'
import {
  addLiquidationItem,
  createLiquidation,
  deleteLiquidationItem,
  fetchLiquidations,
  liquidationItemTotal,
  saveLiquidationDraft,
  submitLiquidation,
  type Liquidation,
} from './liquidationsApi'

const CATEGORIES = ['Supplies', 'Transportation', 'Equipment', 'Repairs', 'Utilities', 'Food', 'Other']

type TabId = 'open' | 'submitted'

export function LiquidationsPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewLiquidations(role)
  const canPrepare = canPrepareLiquidation(role)
  const canViewAll = canViewAllBranchesFundRequests(role)

  const [tab, setTab] = useState<TabId>('open')
  const [requests, setRequests] = useState<FundRequest[]>([])
  const [liquidations, setLiquidations] = useState<Liquidation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const loadedRef = useRef(false)

  const [itemDate, setItemDate] = useState(todayInputValue())
  const [itemCategory, setItemCategory] = useState(CATEGORIES[0])
  const [itemDesc, setItemDesc] = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [returned, setReturned] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    if (!canView) return
    if (!loadedRef.current) setLoading(true)
    setError(null)
    try {
      const [requestRows, liquidationRows] = await Promise.all([
        fetchFundRequests(),
        fetchLiquidations(),
      ])
      setRequests(requestRows)
      setLiquidations(liquidationRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      loadedRef.current = true
      setLoading(false)
    }
  }, [canView])

  useEffect(() => {
    void load()
  }, [load])

  const selected = liquidations.find((l) => l.id === selectedId) ?? null
  const selectedItems = selected?.items ?? []
  const expensed = liquidationItemTotal(selectedItems)
  const requested = Number(selected?.requested_amount ?? 0)

  useEffect(() => {
    if (!selected) {
      setReturned('')
      setNotes('')
      return
    }
    const suggested = Math.max(requested - expensed, 0)
    setReturned(String(selected.status === 'draft' ? suggested : Number(selected.returned_amount)))
    setNotes(selected.notes ?? '')
  }, [selected, expensed, requested])

  const byRequest = useMemo(() => {
    const map = new Map<string, Liquidation>()
    for (const row of liquidations) map.set(row.fund_request_id, row)
    return map
  }, [liquidations])

  const openRequests = useMemo(
    () => requests.filter((r) => r.status === 'released'),
    [requests],
  )

  const submitted = useMemo(
    () => liquidations.filter((l) => l.status === 'submitted'),
    [liquidations],
  )

  const openTotals = useMemo(
    () => ({
      count: openRequests.length,
      requested: openRequests.reduce((sum, r) => sum + Number(r.amount), 0),
    }),
    [openRequests],
  )

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to liquidations.</div>
      </div>
    )
  }

  async function openRequest(request: FundRequest) {
    setError(null)
    setMessage(null)
    const existing = byRequest.get(request.id)
    if (existing) {
      setSelectedId(existing.id)
      return
    }
    if (!canPrepare) return
    try {
      const created = await createLiquidation({
        fundRequestId: request.id,
        branchId: request.branch_id,
        requestedAmount: Number(request.amount),
        preparedBy: user!.id,
      })
      setSelectedId(created.id)
      setMessage('Liquidation started. Add the expense lines, then submit.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onAddItem(event: FormEvent) {
    event.preventDefault()
    if (!selected || !canPrepare || selected.status !== 'draft') return
    const amount = Number(itemAmount)
    if (!itemDesc.trim()) {
      setError('Enter what the money was spent on.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setError(null)
    try {
      await addLiquidationItem({
        liquidationId: selected.id,
        expenseDate: itemDate,
        category: itemCategory,
        description: itemDesc.trim(),
        amount,
      })
      setItemDesc('')
      setItemAmount('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDeleteItem(id: string) {
    if (!window.confirm('Remove this expense line?')) return
    try {
      await deleteLiquidationItem(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onSaveDraft() {
    if (!selected || selected.status !== 'draft') return
    setError(null)
    setMessage(null)
    try {
      await saveLiquidationDraft(selected.id, {
        notes,
        actualSpent: expensed,
        returnedAmount: Number(returned) || 0,
      })
      setMessage('Liquidation saved as draft.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onSubmitLiquidation() {
    if (!selected || selected.status !== 'draft') return
    if (selectedItems.length === 0) {
      setError('Add at least one expense line before submitting.')
      return
    }
    const returnedAmount = Number(returned) || 0
    if (returnedAmount < 0) {
      setError('Returned amount cannot be negative.')
      return
    }
    if (expensed + returnedAmount > requested + 0.01) {
      setError(
        `Expenses (${formatPhp(expensed)}) plus returned (${formatPhp(returnedAmount)}) exceed the ${formatPhp(requested)} released.`,
      )
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await submitLiquidation({
        liquidation: selected,
        actualSpent: expensed,
        returnedAmount,
        notes,
        submittedBy: user!.id,
      })
      setMessage('Liquidation submitted. The fund request is now closed.')
      setSelectedId(null)
      setTab('submitted')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function exportOpen() {
    downloadCsv(
      `open-advances-${todayInputValue()}.csv`,
      ['Date', 'Requester', 'Purpose', 'Category', 'Requested', 'Liquidation'],
      openRequests.map((r) => [
        r.created_at.slice(0, 10),
        r.requester?.full_name ?? '',
        r.purpose,
        r.category ?? '',
        r.amount,
        byRequest.get(r.id)?.status ?? 'not started',
      ]),
    )
  }

  function exportSubmitted() {
    downloadCsv(
      `liquidations-${todayInputValue()}.csv`,
      ['Submitted', 'Requester', 'Purpose', 'Requested', 'Expensed', 'Returned', 'Variance'],
      submitted.map((l) => {
        const spent = liquidationItemTotal(l.items)
        return [
          l.submitted_at?.slice(0, 10) ?? '',
          l.fund_request?.requester?.full_name ?? '',
          l.fund_request?.purpose ?? '',
          l.requested_amount,
          spent,
          l.returned_amount,
          Number(l.requested_amount) - spent - Number(l.returned_amount),
        ]
      }),
    )
  }

  function exportSelected() {
    if (!selected) return
    downloadCsv(
      `liquidation-${(selected.fund_request?.purpose ?? 'request').replace(/[^A-Za-z0-9]+/g, '-')}-${todayInputValue()}.csv`,
      ['Date', 'Category', 'Description', 'Amount'],
      selectedItems.map((i) => [i.expense_date, i.category, i.description, i.amount]),
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Liquidations</h1>
          <p>Track released cash advances: what was requested, what was spent, and what came back.</p>
        </div>
      </div>

      {error && !selected ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <ChipRow>
        <Chip active={tab === 'open'} onClick={() => { setTab('open'); setSelectedId(null) }}>
          Open advances ({openRequests.length})
        </Chip>
        <Chip active={tab === 'submitted'} onClick={() => { setTab('submitted'); setSelectedId(null) }}>
          Submitted ({submitted.length})
        </Chip>
      </ChipRow>

      {loading && requests.length === 0 ? <SkeletonTable rows={5} cols={5} /> : null}

      {tab === 'open' ? (
        <Card
          title="Released, not yet liquidated"
          subtitle={`${openTotals.count} open · ${formatPhp(openTotals.requested)} advanced`}
        >
          <div className="row no-print" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
            <Button variant="secondary" onClick={exportOpen} disabled={openRequests.length === 0}>
              Export CSV
            </Button>
          </div>
          {openRequests.length === 0 ? (
            <div className="empty-state">No released cash advances waiting for liquidation.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Requested</th>
                  {canViewAll ? <th>Branch</th> : null}
                  <th>Requester</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openRequests.map((r) => {
                  const liquidation = byRequest.get(r.id)
                  const spent = liquidationItemTotal(liquidation?.items)
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.created_at)}</td>
                      {canViewAll ? <td>{r.branch?.name ?? '—'}</td> : null}
                      <td>{r.requester?.full_name ?? '—'}</td>
                      <td>{r.purpose}</td>
                      <td>{formatPhp(r.amount)}</td>
                      <td>
                        {liquidation ? (
                          <span>
                            {liquidation.status === 'draft'
                              ? `Draft · ${formatPhp(spent)} spent`
                              : 'Submitted'}
                          </span>
                        ) : (
                          <Badge tone="muted">Not started</Badge>
                        )}
                      </td>
                      <td>
                        <Button variant="ghost" onClick={() => void openRequest(r)} disabled={!canPrepare && !liquidation}>
                          {liquidation ? 'Open' : canPrepare ? 'Prepare' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <Card title="Submitted liquidations" subtitle={`${submitted.length} record(s)`}>
          <div className="row no-print" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
            <Button variant="secondary" onClick={exportSubmitted} disabled={submitted.length === 0}>
              Export CSV
            </Button>
          </div>
          {submitted.length === 0 ? (
            <div className="empty-state">No liquidations submitted yet.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Requester</th>
                  <th>Purpose</th>
                  <th>Requested</th>
                  <th>Expensed</th>
                  <th>Returned</th>
                  <th>Variance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submitted.map((l) => {
                  const spent = liquidationItemTotal(l.items)
                  const variance = Number(l.requested_amount) - spent - Number(l.returned_amount)
                  return (
                    <tr key={l.id}>
                      <td>{formatDate(l.submitted_at)}</td>
                      <td>{l.fund_request?.requester?.full_name ?? l.preparer?.full_name ?? '—'}</td>
                      <td>{l.fund_request?.purpose ?? '—'}</td>
                      <td>{formatPhp(l.requested_amount)}</td>
                      <td>{formatPhp(spent)}</td>
                      <td>{formatPhp(l.returned_amount)}</td>
                      <td>{formatPhp(variance)}</td>
                      <td>
                        <Button variant="ghost" onClick={() => setSelectedId(l.id)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {selected ? (
        <Modal
          open
          onClose={() => setSelectedId(null)}
          title={`Liquidation — ${selected.fund_request?.purpose ?? 'Cash advance'}`}
          subtitle={`${formatPhp(selected.requested_amount)} requested · ${selected.status === 'draft' ? 'Draft' : 'Submitted'}${selected.fund_request?.requester ? ` · ${selected.fund_request.requester.full_name}` : ''}`}
          size="lg"
          footer={
            selected.status === 'draft' && canPrepare ? (
              <>
                <Button variant="secondary" onClick={() => void onSaveDraft()} loading={saving}>
                  Save draft
                </Button>
                <Button onClick={() => void onSubmitLiquidation()} loading={saving}>
                  Submit liquidation
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            )
          }
        >
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p className="muted">Requested</p>
              <strong style={{ fontSize: 20 }}>{formatPhp(requested)}</strong>
            </div>
            <div>
              <p className="muted">Expensed</p>
              <strong style={{ fontSize: 20 }}>{formatPhp(expensed)}</strong>
            </div>
            <div>
              <p className="muted">To return</p>
              <strong style={{ fontSize: 20 }}>
                {formatPhp(selected.status === 'draft' ? Number(returned) || 0 : selected.returned_amount)}
              </strong>
            </div>
            <div>
              <p className="muted">Unaccounted</p>
              <strong
                style={{
                  fontSize: 20,
                  color:
                    requested - expensed - (Number(returned) || 0) !== 0 ? 'var(--color-warning)' : undefined,
                }}
              >
                {formatPhp(requested - expensed - (Number(returned) || 0))}
              </strong>
            </div>
          </div>

          <div className="row no-print" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <Button variant="secondary" onClick={exportSelected} disabled={selectedItems.length === 0}>
              Export expenses CSV
            </Button>
          </div>

          <h3 style={{ marginTop: 16 }}>Expense lines</h3>
          {selectedItems.length === 0 ? (
            <div className="empty-state">No expenses recorded yet.</div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  {selected.status === 'draft' && canPrepare ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {selectedItems.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.expense_date)}</td>
                    <td>{item.category}</td>
                    <td>{item.description}</td>
                    <td>{formatPhp(item.amount)}</td>
                    {selected.status === 'draft' && canPrepare ? (
                      <td>
                        <Button variant="danger" onClick={() => void onDeleteItem(item.id)}>
                          Remove
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total expensed</strong>
                  </td>
                  <td>
                    <strong>{formatPhp(expensed)}</strong>
                  </td>
                  {selected.status === 'draft' && canPrepare ? <td /> : null}
                </tr>
              </tfoot>
            </Table>
          )}

          {selected.status === 'draft' && canPrepare ? (
            <>
              <form className="stack" style={{ marginTop: 16 }} onSubmit={onAddItem}>
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <Field label="Date" htmlFor="liq-date">
                      <TextInput
                        id="liq-date"
                        type="date"
                        required
                        value={itemDate}
                        onChange={(e) => setItemDate(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Field label="Category" htmlFor="liq-cat">
                      <SelectInput
                        id="liq-cat"
                        value={itemCategory}
                        onChange={(e) => setItemCategory(e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <Field label="What was spent" htmlFor="liq-desc">
                      <TextInput
                        id="liq-desc"
                        required
                        value={itemDesc}
                        onChange={(e) => setItemDesc(e.target.value)}
                        placeholder="e.g. diesel for delivery"
                      />
                    </Field>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <Field label="Amount (₱)" htmlFor="liq-amount">
                      <TextInput
                        id="liq-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={itemAmount}
                        onChange={(e) => setItemAmount(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Button type="submit" variant="secondary">
                    Add line
                  </Button>
                </div>
              </form>

              <Field label="Amount returned to the company (₱)" htmlFor="liq-returned">
                <TextInput
                  id="liq-returned"
                  type="number"
                  min="0"
                  step="0.01"
                  value={returned}
                  onChange={(e) => setReturned(e.target.value)}
                />
              </Field>
              <Field label="Notes" htmlFor="liq-notes">
                <TextArea id="liq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              {selected.notes ? <p className="muted">Notes: {selected.notes}</p> : null}
              <p className="faint">
                Submitted {formatDate(selected.submitted_at)} · Returned {formatPhp(selected.returned_amount)}
              </p>
            </>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
