import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches } from '../inventory/inventoryApi'
import { formatDate } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { canManageCustomers, canViewAllBranchesSales, canViewCustomers } from '../../lib/roles'
import type { Branch } from '../../types/database'
import {
  createCustomerRecord,
  fetchCustomerAccounts,
  updateCustomerRecord,
  type CustomerAccount,
} from './customersApi'

interface CustomerForm {
  name: string
  contact: string
  address: string
  notes: string
  active: boolean
}

const emptyForm: CustomerForm = { name: '', contact: '', address: '', notes: '', active: true }

export function CustomersPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const profileBranchId = user!.profile.branch_id
  const canView = canViewCustomers(role)
  const canManage = canManageCustomers(role)
  const canViewAll = canViewAllBranchesSales(role)

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState(profileBranchId ?? '')
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (!canView) return
    if (!loadedRef.current) setLoading(true)
    setError(null)
    try {
      const rows = await fetchCustomerAccounts(canViewAll ? branchId || null : profileBranchId)
      setAccounts(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      loadedRef.current = true
      setLoading(false)
    }
  }, [branchId, canView, canViewAll, profileBranchId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!canViewAll) return
    void fetchBranches().then(setBranches).catch(() => setBranches([]))
  }, [canViewAll])

  const selected = accounts.find((a) => a.customer.id === selectedId) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter(
      (a) =>
        a.customer.name.toLowerCase().includes(q) ||
        (a.customer.contact ?? '').toLowerCase().includes(q) ||
        (a.customer.address ?? '').toLowerCase().includes(q),
    )
  }, [accounts, query])

  const totals = useMemo(
    () => ({
      customers: accounts.length,
      withBalance: accounts.filter((a) => a.balance > 0).length,
      balance: accounts.reduce((sum, a) => sum + a.balance, 0),
      overdue: accounts.filter((a) => a.overdue).length,
    }),
    [accounts],
  )

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to customers.</div>
      </div>
    )
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setMessage(null)
    setError(null)
  }

  function startEdit(account: CustomerAccount) {
    setEditingId(account.customer.id)
    setForm({
      name: account.customer.name,
      contact: account.customer.contact ?? '',
      address: account.customer.address ?? '',
      notes: account.customer.notes ?? '',
      active: account.customer.active,
    })
    setShowForm(true)
    setMessage(null)
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    if (!form.name.trim()) {
      setError('Enter the customer name.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      if (editingId) {
        await updateCustomerRecord(editingId, {
          name: form.name.trim(),
          contact: form.contact.trim(),
          address: form.address.trim(),
          notes: form.notes.trim(),
          active: form.active,
        })
        setMessage('Customer updated.')
      } else {
        const created = await createCustomerRecord({
          name: form.name.trim(),
          branch_id: canViewAll ? branchId || null : profileBranchId,
          contact: form.contact.trim(),
          address: form.address.trim(),
          notes: form.notes.trim(),
        })
        setSelectedId(created.id)
        setMessage(`Customer ${created.name} added.`)
      }
      setEditingId(null)
      setShowForm(false)
      setForm(emptyForm)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function exportBalances() {
    downloadCsv(
      `customer-balances-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Customer', 'Contact', 'Address', 'Open sales', 'Installment sales', 'Balance', 'Next due', 'Overdue'],
      filtered.map((a) => [
        a.customer.name,
        a.customer.contact,
        a.customer.address,
        a.openSales.length,
        a.installmentCount,
        a.balance,
        a.nextDueDate ?? '',
        a.overdue ? 'Yes' : 'No',
      ]),
    )
  }

  function exportStatement() {
    if (!selected) return
    downloadCsv(
      `statement-${selected.customer.name.replace(/[^A-Za-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['DR', 'Date', 'Type', 'Total', 'Paid', 'Balance'],
      selected.openSales.map((s) => [
        s.dr_number ?? '',
        s.sale_date,
        s.payment_type,
        s.total,
        s.amount_paid,
        s.balance,
      ]),
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>Customer records, installment balances, and open delivery receipts.</p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                return
              }
              setSelectedId(null)
              startCreate()
            }}
          >
            {showForm ? 'Close form' : 'Add customer'}
          </Button>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      {canViewAll ? (
        <Card title="Branch">
          <Field label="Show customers for" htmlFor="cust-branch">
            <SelectInput
              id="cust-branch"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value)
                setSelectedId(null)
              }}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </Card>
      ) : null}

      <Card title="Summary">
        <div className="row" style={{ flexWrap: 'wrap', gap: 28 }}>
          <div>
            <p className="muted">Customers</p>
            <strong style={{ fontSize: 20 }}>{totals.customers}</strong>
          </div>
          <div>
            <p className="muted">With balance</p>
            <strong style={{ fontSize: 20 }}>{totals.withBalance}</strong>
          </div>
          <div>
            <p className="muted">Total receivables</p>
            <strong style={{ fontSize: 20 }}>{formatPhp(totals.balance)}</strong>
          </div>
          <div>
            <p className="muted">Overdue</p>
            <strong style={{ fontSize: 20, color: totals.overdue ? 'var(--color-danger)' : undefined }}>
              {totals.overdue}
            </strong>
          </div>
        </div>
      </Card>

      {showForm && canManage ? (
        <Card title={editingId ? 'Edit customer' : 'New customer'}>
          <form className="stack" onSubmit={onSubmit}>
            <Field label="Name" htmlFor="cust-name">
              <TextInput
                id="cust-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Contact" htmlFor="cust-contact" hint="Phone or email">
              <TextInput
                id="cust-contact"
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              />
            </Field>
            <Field label="Address" htmlFor="cust-address">
              <TextInput
                id="cust-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Field>
            <Field label="Notes" htmlFor="cust-notes">
              <TextArea
                id="cust-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
            {editingId ? (
              <Field label="Status" htmlFor="cust-active">
                <SelectInput
                  id="cust-active"
                  value={form.active ? 'active' : 'inactive'}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'active' }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </SelectInput>
              </Field>
            ) : null}
            <div className="row">
              <Button type="submit" loading={saving}>
                {editingId ? 'Save changes' : 'Add customer'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null)
                  setShowForm(false)
                  setForm(emptyForm)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card
        title="Customer list"
        subtitle={`${filtered.length} of ${accounts.length} shown`}
      >
        <div className="row" style={{ alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label="Search" htmlFor="cust-search">
              <TextInput
                id="cust-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, contact, or address"
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={exportBalances} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <SkeletonTable rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">No customers yet.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Open sales</th>
                <th>Balance</th>
                <th>Next due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.customer.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(a.customer.id)}>
                  <td>
                    <strong>{a.customer.name}</strong>
                    {!a.customer.active ? <div className="faint">Inactive</div> : null}
                    {a.customer.address ? <div className="faint">{a.customer.address}</div> : null}
                  </td>
                  <td>{a.customer.contact ?? '—'}</td>
                  <td>{a.openSales.length > 0 ? `${a.openSales.length} (${a.installmentCount} installment)` : '—'}</td>
                  <td>{formatPhp(a.balance)}</td>
                  <td>
                    {a.nextDueDate ? (
                      <span style={{ color: a.overdue ? 'var(--color-danger)' : undefined, fontWeight: a.overdue ? 600 : undefined }}>
                        {formatDate(a.nextDueDate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <Button variant="ghost" onClick={() => setSelectedId(a.customer.id)}>
                        Open
                      </Button>
                      {canManage ? (
                        <Button variant="secondary" onClick={() => startEdit(a)}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {selected ? (
        <Card
          title={selected.customer.name}
          subtitle={
            selected.balance > 0
              ? `Outstanding ${formatPhp(selected.balance)} · ${selected.openSales.length} open sale(s)`
              : 'No outstanding balance'
          }
        >
          <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p className="muted">Contact</p>
              <strong>{selected.customer.contact ?? '—'}</strong>
            </div>
            <div>
              <p className="muted">Address</p>
              <strong>{selected.customer.address ?? '—'}</strong>
            </div>
            <div>
              <p className="muted">Next due</p>
              <strong>{selected.nextDueDate ? formatDate(selected.nextDueDate) : '—'}</strong>
            </div>
            <div>
              <p className="muted">Status</p>
              <Badge tone={selected.customer.active ? 'default' : 'muted'}>
                {selected.customer.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <h3 style={{ marginTop: 20 }}>Open sales</h3>
          {selected.openSales.length === 0 ? (
            <div className="empty-state">No open balance for this customer.</div>
          ) : (
            <>
              <div className="row no-print" style={{ justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={exportStatement}>
                  Export statement CSV
                </Button>
              </div>
              <Table>
                <thead>
                  <tr>
                    <th>DR</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.openSales.map((s) => (
                    <tr key={s.id}>
                      <td>{s.dr_number ?? '—'}</td>
                      <td>{formatDate(s.sale_date)}</td>
                      <td>{s.payment_type}</td>
                      <td>{formatPhp(s.total)}</td>
                      <td>{formatPhp(s.amount_paid)}</td>
                      <td>{formatPhp(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}

          {selected.customer.notes ? (
            <p className="muted" style={{ marginTop: 12 }}>
              {selected.customer.notes}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
