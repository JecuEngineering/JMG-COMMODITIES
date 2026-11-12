import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches, fetchSkus, skuLabel } from '../inventory/inventoryApi'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import {
  canManageSuppliers,
  canReceiveContainers,
  canViewContainers,
} from '../../lib/roles'
import type { Branch, Sku } from '../../types/database'
import {
  addContainerCost,
  closeContainer,
  containerLandedTotal,
  createContainer,
  createPurchase,
  createSupplier,
  fetchContainers,
  fetchPurchases,
  fetchSuppliers,
  receiveContainer,
  recordPurchasePayment,
  updateContainer,
  updateContainerStatus,
  type Container,
  type ContainerCostType,
  type Purchase,
  type Supplier,
} from './containersApi'

type TabId = 'containers' | 'suppliers' | 'purchases'

const COST_TYPES: ContainerCostType[] = [
  'purchase',
  'freight',
  'duties',
  'handling',
  'trucking',
  'other',
]

export function ContainersPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewContainers(role)
  const canManage = canManageSuppliers(role)
  const canReceive = canReceiveContainers(role)
  const profileBranchId = user!.profile.branch_id

  const [tab, setTab] = useState<TabId>('containers')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [firstLoad, setFirstLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')

  // Supplier form
  const [supName, setSupName] = useState('')
  const [supContact, setSupContact] = useState('')
  const [supNotes, setSupNotes] = useState('')

  // Purchase form
  const [purSupplier, setPurSupplier] = useState('')
  const [purDate, setPurDate] = useState(todayInputValue())
  const [purTotal, setPurTotal] = useState('')
  const [purNotes, setPurNotes] = useState('')
  const [payPurchaseId, setPayPurchaseId] = useState('')
  const [payAmount, setPayAmount] = useState('')

  // Container form
  const [cSupplier, setCSupplier] = useState('')
  const [cPurchase, setCPurchase] = useState('')
  const [cNumber, setCNumber] = useState('')
  const [cRef, setCRef] = useState('')
  const [cOrigin, setCOrigin] = useState('')
  const [cEta, setCEta] = useState('')
  const [cBranch, setCBranch] = useState(profileBranchId ?? '')
  const [cSku, setCSku] = useState('')
  const [cExpected, setCExpected] = useState('')
  const [cNotes, setCNotes] = useState('')

  // Edit container (including supplier)
  const [editing, setEditing] = useState(false)
  const [eSupplier, setESupplier] = useState('')
  const [ePurchase, setEPurchase] = useState('')
  const [eNumber, setENumber] = useState('')
  const [eRef, setERef] = useState('')
  const [eOrigin, setEOrigin] = useState('')
  const [eEta, setEEta] = useState('')
  const [eBranch, setEBranch] = useState('')
  const [eNotes, setENotes] = useState('')

  // Cost form
  const [costType, setCostType] = useState<ContainerCostType>('purchase')
  const [costAmount, setCostAmount] = useState('')
  const [costRef, setCostRef] = useState('')

  // Receive actuals
  const [actuals, setActuals] = useState<Record<string, string>>({})
  const [diffReasons, setDiffReasons] = useState<Record<string, string>>({})
  const [unloadNotes, setUnloadNotes] = useState('')

  const selected = useMemo(
    () => containers.find((c) => c.id === selectedId) ?? null,
    [containers, selectedId],
  )

  const openPurchases = useMemo(
    () => purchases.filter((p) => p.status !== 'cancelled' && Number(p.paid_amount) < Number(p.total)),
    [purchases],
  )
  const payablesTotal = openPurchases.reduce(
    (sum, p) => sum + (Number(p.total) - Number(p.paid_amount)),
    0,
  )
  const payTarget = openPurchases.find((p) => p.id === payPurchaseId) ?? openPurchases[0] ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, p, c, b, sk] = await Promise.all([
        fetchSuppliers(),
        fetchPurchases(),
        fetchContainers(),
        fetchBranches(),
        fetchSkus(),
      ])
      setSuppliers(s)
      setPurchases(p)
      setPayPurchaseId((prev) => prev || p.find((row) => row.status !== 'cancelled' && Number(row.paid_amount) < Number(row.total))?.id || '')
      setContainers(c)
      setBranches(b)
      setSkus(sk)
      setPurSupplier((prev) => prev || s[0]?.id || '')
      setCSupplier((prev) => prev || s[0]?.id || '')
      setCBranch((prev) => prev || profileBranchId || b[0]?.id || '')
      setCSku((prev) => prev || sk[0]?.id || '')
      setSelectedId((prev) => prev || c[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setFirstLoad(false)
    }
  }, [profileBranchId])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to containers and suppliers.</div>
      </div>
    )
  }

  async function onAddSupplier(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    setError(null)
    try {
      await createSupplier({ name: supName.trim(), contact: supContact, notes: supNotes })
      setMessage('Supplier added.')
      setSupName('')
      setSupContact('')
      setSupNotes('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onAddPurchase(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    setError(null)
    const total = Number(purTotal)
    if (!purSupplier) {
      setError('Choose a supplier.')
      return
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError('Enter a purchase total greater than zero.')
      return
    }
    try {
      await createPurchase({
        supplier_id: purSupplier,
        purchase_date: purDate,
        total,
        notes: purNotes,
      })
      setMessage('Purchase recorded.')
      setPurTotal('')
      setPurNotes('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRecordPayment(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !payTarget) return
    setError(null)
    const amount = Number(payAmount)
    try {
      await recordPurchasePayment(payTarget, amount)
      setMessage('Supplier payment recorded.')
      setPayAmount('')
      setPayPurchaseId('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onCreateContainer(event: FormEvent) {
    event.preventDefault()
    if (!canManage && !canReceive) return
    setError(null)
    try {
      const id = await createContainer({
        supplier_id: cSupplier,
        purchase_id: cPurchase || null,
        container_number: cNumber,
        supplier_ref: cRef.trim(),
        origin: cOrigin,
        expected_arrival: cEta || undefined,
        primary_branch_id: cBranch,
        notes: cNotes,
        lines: [{ sku_id: cSku, branch_id: cBranch, expected_sacks: Number(cExpected) }],
      })
      setMessage('Container created as In transit.')
      setCNumber('')
      setCRef('')
      setCExpected('')
      setSelectedId(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onAddCost(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !selected) return
    setError(null)
    try {
      await addContainerCost({
        container_id: selected.id,
        cost_type: costType,
        amount: Number(costAmount),
        reference_no: costRef,
      })
      setMessage('Landed cost line added.')
      setCostAmount('')
      setCostRef('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onMark(status: 'arrived' | 'unloading') {
    if (!selected) return
    setError(null)
    try {
      await updateContainerStatus(selected.id, status)
      setMessage(`Container marked ${status.replace('_', ' ')}.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onReceive() {
    if (!selected || !canReceive) return
    setError(null)
    try {
      const lines = (selected.lines ?? []).map((line) => ({
        line_id: line.id,
        actual_sacks: Number(actuals[line.id] ?? line.expected_sacks),
        difference_reason: diffReasons[line.id] || undefined,
      }))
      await receiveContainer(selected.id, lines, unloadNotes.trim() || undefined)
      setMessage('Container received — stock in posted and cost per sack computed.')
      setUnloadNotes('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onClose() {
    if (!selected || !canManage) return
    setError(null)
    try {
      await closeContainer(selected.id)
      setMessage('Container closed.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function startContainerEdit() {
    if (!selected) return
    setESupplier(selected.supplier_id)
    setEPurchase(selected.purchase_id ?? '')
    setENumber(selected.container_number ?? '')
    setERef(selected.supplier_ref)
    setEOrigin(selected.origin ?? '')
    setEEta(selected.expected_arrival ?? '')
    setEBranch(selected.primary_branch_id ?? '')
    setENotes(selected.notes ?? '')
    setEditing(true)
    setError(null)
    setMessage(null)
  }

  async function onUpdateContainer(event: FormEvent) {
    event.preventDefault()
    if (!selected || !canManage) return
    if (!eSupplier) {
      setError('Choose a supplier.')
      return
    }
    if (!eRef.trim()) {
      setError('Enter the supplier reference number.')
      return
    }
    setError(null)
    try {
      await updateContainer({
        id: selected.id,
        supplier_id: eSupplier,
        purchase_id: ePurchase || null,
        container_number: eNumber,
        supplier_ref: eRef.trim(),
        origin: eOrigin,
        expected_arrival: eEta || undefined,
        primary_branch_id: eBranch,
        notes: eNotes,
      })
      setMessage('Container details updated.')
      setEditing(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function exportContainers() {
    downloadCsv(
      `containers-${todayInputValue()}.csv`,
      ['Container #', 'Supplier ref', 'Supplier', 'Origin', 'Primary branch', 'ETA', 'Arrived', 'Status', 'Expected sacks', 'Landed costs'],
      containers.map((c) => [
        c.container_number ?? '',
        c.supplier_ref,
        c.supplier?.name ?? '',
        c.origin ?? '',
        c.primary_branch?.name ?? '',
        c.expected_arrival ?? '',
        c.arrival_date ?? '',
        c.status,
        (c.lines ?? []).reduce((sum, line) => sum + Number(line.expected_sacks), 0),
        containerLandedTotal(c.costs),
      ]),
    )
  }

  function exportPurchases() {
    downloadCsv(
      `supplier-purchases-${todayInputValue()}.csv`,
      ['Date', 'Supplier', 'Total', 'Paid', 'Balance', 'Status', 'Notes'],
      purchases.map((p) => [
        p.purchase_date,
        p.supplier?.name ?? '',
        p.total,
        p.paid_amount,
        Number(p.total) - Number(p.paid_amount),
        p.status,
        p.notes ?? '',
      ]),
    )
  }

  function exportSuppliers() {
    downloadCsv(
      `suppliers-${todayInputValue()}.csv`,
      ['Name', 'Contact', 'Notes'],
      suppliers.map((s) => [s.name, s.contact ?? '', s.notes ?? '']),
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Containers</h1>
          <p>Suppliers, purchases, arrival, landed costs, and receiving into branch stock.</p>
        </div>
      </div>

      <ChipRow>
        <Chip active={tab === 'containers'} onClick={() => setTab('containers')}>
          Containers
        </Chip>
        <Chip active={tab === 'suppliers'} onClick={() => setTab('suppliers')}>
          Suppliers
        </Chip>
        <Chip active={tab === 'purchases'} onClick={() => setTab('purchases')}>
          Purchases
        </Chip>
      </ChipRow>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {loading && firstLoad ? <SkeletonTable rows={5} cols={5} /> : null}

      {tab === 'suppliers' ? (
        <div className="stack">
          {canManage ? (
            <Card title="Add supplier">
              <form className="stack" onSubmit={onAddSupplier}>
                <Field label="Name" htmlFor="sup-name">
                  <TextInput id="sup-name" required value={supName} onChange={(e) => setSupName(e.target.value)} />
                </Field>
                <Field label="Contact" htmlFor="sup-contact">
                  <TextInput id="sup-contact" value={supContact} onChange={(e) => setSupContact(e.target.value)} />
                </Field>
                <Field label="Notes" htmlFor="sup-notes">
                  <TextArea id="sup-notes" value={supNotes} onChange={(e) => setSupNotes(e.target.value)} />
                </Field>
                <Button type="submit">Save supplier</Button>
              </form>
            </Card>
          ) : null}
          <Card
            title="Supplier list"
            action={
              suppliers.length > 0 ? (
                <Button variant="secondary" onClick={exportSuppliers}>
                  Export CSV
                </Button>
              ) : undefined
            }
          >
            {suppliers.length === 0 ? (
              <div className="empty-state">No suppliers yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.contact ?? '—'}</td>
                      <td>{s.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'purchases' ? (
        <div className="stack">
          {canManage ? (
            <Card title="New purchase">
              <form className="stack" onSubmit={onAddPurchase}>
                <Field label="Supplier" htmlFor="pur-sup">
                  <SelectInput
                    id="pur-sup"
                    required
                    value={purSupplier}
                    onChange={(e) => setPurSupplier(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Date" htmlFor="pur-date">
                  <TextInput id="pur-date" type="date" value={purDate} onChange={(e) => setPurDate(e.target.value)} />
                </Field>
                <Field label="Total (₱)" htmlFor="pur-total">
                  <TextInput
                    id="pur-total"
                    required
                    inputMode="decimal"
                    value={purTotal}
                    onChange={(e) => setPurTotal(e.target.value)}
                  />
                </Field>
                <Field label="Notes" htmlFor="pur-notes">
                  <TextInput id="pur-notes" value={purNotes} onChange={(e) => setPurNotes(e.target.value)} />
                </Field>
                <Button type="submit">Save purchase</Button>
              </form>
            </Card>
          ) : null}
          {canManage ? (
            <Card title="Record supplier payment" subtitle={`Open payables: ${formatPhp(payablesTotal)}`}>
              {openPurchases.length === 0 ? (
                <p className="faint">No open payables — every purchase is fully paid.</p>
              ) : (
                <form className="stack" onSubmit={onRecordPayment}>
                  <Field label="Purchase" htmlFor="pay-purchase">
                    <SelectInput
                      id="pay-purchase"
                      required
                      value={payTarget?.id ?? ''}
                      onChange={(e) => setPayPurchaseId(e.target.value)}
                    >
                      {openPurchases.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.supplier?.name ?? 'Supplier'} · {formatDate(p.purchase_date)} · balance{' '}
                          {formatPhp(Number(p.total) - Number(p.paid_amount))}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field
                    label="Amount (₱)"
                    htmlFor="pay-amount"
                    hint={
                      payTarget
                        ? `Remaining balance: ${formatPhp(Number(payTarget.total) - Number(payTarget.paid_amount))}`
                        : undefined
                    }
                  >
                    <TextInput
                      id="pay-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={!payTarget}>Record payment</Button>
                </form>
              )}
            </Card>
          ) : null}
          <Card
            title="Purchases"
            action={
              purchases.length > 0 ? (
                <Button variant="secondary" onClick={exportPurchases}>
                  Export CSV
                </Button>
              ) : undefined
            }
          >
            {purchases.length === 0 ? (
              <div className="empty-state">No purchases yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.purchase_date)}</td>
                      <td>{p.supplier?.name ?? '—'}</td>
                      <td>{formatPhp(p.total)}</td>
                      <td>{formatPhp(p.paid_amount)}</td>
                      <td>{formatPhp(Number(p.total) - Number(p.paid_amount))}</td>
                      <td>
                        <Badge tone={p.status === 'partial' ? 'warning' : p.status === 'paid' ? 'muted' : 'default'}>
                          {p.status}
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

      {tab === 'containers' ? (
        <div className="stack">
          {(canManage || canReceive) && canManage ? (
            <Card title="New container" subtitle="Starts as In transit with supplier reference">
              <form className="stack" onSubmit={onCreateContainer}>
                <Field label="Supplier" htmlFor="c-sup">
                  <SelectInput id="c-sup" required value={cSupplier} onChange={(e) => setCSupplier(e.target.value)}>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Purchase (optional)" htmlFor="c-pur">
                  <SelectInput id="c-pur" value={cPurchase} onChange={(e) => setCPurchase(e.target.value)}>
                    <option value="">None</option>
                    {purchases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.supplier?.name} · {formatPhp(p.total)} · {formatDate(p.purchase_date)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Container number" htmlFor="c-number" hint="Shipping container ID, e.g. MSKU1234567">
                  <TextInput id="c-number" value={cNumber} onChange={(e) => setCNumber(e.target.value)} />
                </Field>
                <Field label="Supplier reference #" htmlFor="c-ref">
                  <TextInput id="c-ref" required value={cRef} onChange={(e) => setCRef(e.target.value)} />
                </Field>
                <Field label="Origin" htmlFor="c-origin">
                  <TextInput id="c-origin" value={cOrigin} onChange={(e) => setCOrigin(e.target.value)} />
                </Field>
                <Field label="Expected arrival" htmlFor="c-eta">
                  <TextInput id="c-eta" type="date" value={cEta} onChange={(e) => setCEta(e.target.value)} />
                </Field>
                <Field label="Primary branch" htmlFor="c-branch">
                  <SelectInput id="c-branch" required value={cBranch} onChange={(e) => setCBranch(e.target.value)}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="SKU" htmlFor="c-sku">
                  <SelectInput id="c-sku" required value={cSku} onChange={(e) => setCSku(e.target.value)}>
                    {skus.map((s) => (
                      <option key={s.id} value={s.id}>
                        {skuLabel(s)}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Expected sacks" htmlFor="c-exp">
                  <TextInput
                    id="c-exp"
                    required
                    value={cExpected}
                    onChange={(e) => setCExpected(e.target.value)}
                  />
                </Field>
                <Field label="Notes" htmlFor="c-notes">
                  <TextInput id="c-notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
                </Field>
                <Button type="submit">Create container</Button>
              </form>
            </Card>
          ) : null}

          <Card
            title="Container list"
            action={
              containers.length > 0 ? (
                <Button variant="secondary" onClick={exportContainers}>
                  Export CSV
                </Button>
              ) : undefined
            }
          >
            {containers.length === 0 ? (
              <div className="empty-state">No containers yet.</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Container #</th>
                    <th>Ref</th>
                    <th>Supplier</th>
                    <th>Branch</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.container_number || '—'}</td>
                      <td>{c.supplier_ref}</td>
                      <td>{c.supplier?.name ?? '—'}</td>
                      <td>{c.primary_branch?.name ?? '—'}</td>
                      <td>
                        <Badge
                          tone={
                            c.status === 'received' || c.status === 'closed'
                              ? 'default'
                              : c.status === 'in_transit'
                                ? 'muted'
                                : 'warning'
                          }
                        >
                          {c.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td>
                        <Button variant="ghost" onClick={() => setSelectedId(c.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {selected ? (
            <Card
              title={`Container ${selected.container_number || selected.supplier_ref}`}
              subtitle={`${selected.container_number ? `Ref ${selected.supplier_ref} · ` : ''}${selected.supplier?.name ?? ''} · ${selected.status.replace('_', ' ')}`}
            >
              <div className="stack">
                <p className="muted">
                  Origin {selected.origin || '—'} · ETA {formatDate(selected.expected_arrival)} · Arrived{' '}
                  {formatDate(selected.arrival_date)}
                </p>

                <div className="row">
                  {canManage && selected.status !== 'received' && selected.status !== 'closed' ? (
                    <Button variant="secondary" onClick={() => (editing ? setEditing(false) : startContainerEdit())}>
                      {editing ? 'Cancel edit' : 'Edit details / supplier'}
                    </Button>
                  ) : null}
                  {canReceive && selected.status === 'in_transit' ? (
                    <Button variant="secondary" onClick={() => void onMark('arrived')}>
                      Mark arrived
                    </Button>
                  ) : null}
                  {canReceive && selected.status === 'arrived' ? (
                    <Button variant="secondary" onClick={() => void onMark('unloading')}>
                      Start unloading
                    </Button>
                  ) : null}
                  {canManage && selected.status === 'received' ? (
                    <Button variant="secondary" onClick={() => void onClose()}>
                      Close container
                    </Button>
                  ) : null}
                </div>

                {editing ? (
                  <form className="stack" onSubmit={onUpdateContainer}>
                    <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <Field label="Supplier" htmlFor="e-sup">
                        <SelectInput
                          id="e-sup"
                          required
                          value={eSupplier}
                          onChange={(e) => setESupplier(e.target.value)}
                        >
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Purchase (optional)" htmlFor="e-pur">
                        <SelectInput id="e-pur" value={ePurchase} onChange={(e) => setEPurchase(e.target.value)}>
                          <option value="">None</option>
                          {purchases.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.supplier?.name} · {formatPhp(p.total)} · {formatDate(p.purchase_date)}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                    <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <Field label="Container number" htmlFor="e-number">
                        <TextInput id="e-number" value={eNumber} onChange={(e) => setENumber(e.target.value)} />
                      </Field>
                      <Field label="Supplier reference #" htmlFor="e-ref">
                        <TextInput id="e-ref" required value={eRef} onChange={(e) => setERef(e.target.value)} />
                      </Field>
                    </div>
                    <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <Field label="Origin" htmlFor="e-origin">
                        <TextInput id="e-origin" value={eOrigin} onChange={(e) => setEOrigin(e.target.value)} />
                      </Field>
                      <Field label="Expected arrival" htmlFor="e-eta">
                        <TextInput id="e-eta" type="date" value={eEta} onChange={(e) => setEEta(e.target.value)} />
                      </Field>
                      <Field label="Primary branch" htmlFor="e-branch">
                        <SelectInput id="e-branch" value={eBranch} onChange={(e) => setEBranch(e.target.value)}>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                    </div>
                    <Field label="Notes" htmlFor="e-notes">
                      <TextInput id="e-notes" value={eNotes} onChange={(e) => setENotes(e.target.value)} />
                    </Field>
                    <div className="row">
                      <Button type="submit">Save container</Button>
                      <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : null}

                <h3 style={{ fontSize: '1rem' }}>Lines (expected vs actual)</h3>
                <Table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Branch</th>
                      <th>Expected</th>
                      <th>Actual</th>
                      <th>Cost/sack</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.lines ?? []).map((line) => (
                      <tr key={line.id}>
                        <td>{line.sku ? skuLabel(line.sku) : line.sku_id}</td>
                        <td>{line.branch?.name ?? '—'}</td>
                        <td>{line.expected_sacks}</td>
                        <td>
                          {selected.status === 'received' || selected.status === 'closed' ? (
                            line.actual_sacks ?? '—'
                          ) : canReceive ? (
                            <TextInput
                              value={actuals[line.id] ?? String(line.expected_sacks)}
                              onChange={(e) =>
                                setActuals((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                            />
                          ) : (
                            line.actual_sacks ?? '—'
                          )}
                        </td>
                        <td>{line.cost_per_sack != null ? formatPhp(line.cost_per_sack) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {canReceive &&
                (selected.status === 'arrived' ||
                  selected.status === 'unloading' ||
                  selected.status === 'in_transit') ? (
                  <div className="stack">
                    {(selected.lines ?? []).map((line) => (
                      <Field
                        key={`diff-${line.id}`}
                        label={`Difference reason · ${line.sku ? skuLabel(line.sku) : ''}`}
                        htmlFor={`diff-${line.id}`}
                      >
                        <TextInput
                          id={`diff-${line.id}`}
                          value={diffReasons[line.id] ?? ''}
                          onChange={(e) =>
                            setDiffReasons((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                          placeholder="Shortage / damage (if any)"
                        />
                      </Field>
                    ))}
                    <Field label="Unloading notes" htmlFor="unload-notes">
                      <TextArea
                        id="unload-notes"
                        value={unloadNotes}
                        onChange={(e) => setUnloadNotes(e.target.value)}
                      />
                    </Field>
                    <Button onClick={() => void onReceive()}>Receive & post stock</Button>
                  </div>
                ) : null}

                <h3 style={{ fontSize: '1rem' }}>
                  Landed costs · total {formatPhp(containerLandedTotal(selected.costs))}
                </h3>
                <Table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.costs ?? []).map((cost) => (
                      <tr key={cost.id}>
                        <td>{cost.cost_type}</td>
                        <td>{formatPhp(cost.amount)}</td>
                        <td>{cost.reference_no ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {canManage && selected.status !== 'closed' ? (
                  <form className="stack" onSubmit={onAddCost}>
                    <Field label="Cost type" htmlFor="cost-type">
                      <SelectInput
                        id="cost-type"
                        value={costType}
                        onChange={(e) => setCostType(e.target.value as ContainerCostType)}
                      >
                        {COST_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Amount (₱)" htmlFor="cost-amt">
                      <TextInput
                        id="cost-amt"
                        required
                        value={costAmount}
                        onChange={(e) => setCostAmount(e.target.value)}
                      />
                    </Field>
                    <Field label="Reference" htmlFor="cost-ref">
                      <TextInput id="cost-ref" value={costRef} onChange={(e) => setCostRef(e.target.value)} />
                    </Field>
                    <Button type="submit">Add cost</Button>
                  </form>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
