import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../../app/Icon'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
import { ScopePill } from '../../components/ScopePill'
import { ScopeSelect } from '../../components/ScopeSelect'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches } from '../inventory/inventoryApi'
import { writeAuditLog } from '../../lib/audit'
import { formatDate } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { canManageCustomers, canViewAllBranchesSales, canViewCustomers } from '../../lib/roles'
import type { Branch } from '../../types/database'
import {
  createCustomerRecord,
  deleteCustomerRecord,
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
  const [deletingAccount, setDeletingAccount] = useState<CustomerAccount | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const loadedRef = useRef(false)
  const listTopRef = useRef<HTMLElement>(null)

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

  const customerPager = usePaged(filtered, 10, listTopRef)

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to customers.</div>
      </div>
    )
  }

  function closeForm() {
    setEditingId(null)
    setShowForm(false)
    setForm(emptyForm)
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

  async function confirmDelete() {
    if (!canManage || !deletingAccount || deletingAccount.balance > 0) return
    const account = deletingAccount
    setDeleteBusy(true)
    setError(null)
    setMessage(null)
    try {
      const deletedAt = await deleteCustomerRecord(account.customer.id)
      await writeAuditLog({
        action: 'delete',
        tableName: 'customers',
        recordId: account.customer.id,
        oldValue: { name: account.customer.name, active: account.customer.active },
        newValue: { active: false, deleted_at: deletedAt },
      })
      if (selectedId === account.customer.id) setSelectedId(null)
      setMessage(`${account.customer.name} deleted.`)
      setDeletingAccount(null)
      await load()
    } catch (e) {
      setDeletingAccount(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleteBusy(false)
    }
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
          <ScopePill
            label={
              canViewAll
                ? branches.find((b) => b.id === branchId)?.name ?? 'All branches'
                : user!.profile.branch?.name ?? 'Branch'
            }
          />
          <h1>Customers</h1>
          <p>Customer records, installment balances, and open delivery receipts.</p>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          {canViewAll ? (
            <ScopeSelect
              value={branchId}
              onChange={(next) => {
                setBranchId(next)
                setSelectedId(null)
              }}
              ariaLabel="Show customers for"
              options={[
                { value: '', label: 'All branches' },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          ) : null}
          {canManage ? (
            <Button
              onClick={() => {
                setSelectedId(null)
                startCreate()
              }}
            >
              Add customer
            </Button>
          ) : null}
        </div>
      </div>

      {error && !showForm ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="ui-stats">
        <div className="ui-stat">
          <span className="ui-stat-label">Customers</span>
          <strong className="ui-stat-value num">{totals.customers}</strong>
          <span className="ui-stat-sub">Records in this view</span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">With balance</span>
          <strong className="ui-stat-value num">{totals.withBalance}</strong>
          <span className="ui-stat-sub">
            {totals.withBalance === 0 ? 'No open balances' : 'Carrying an open balance'}
          </span>
        </div>
        <div className="ui-stat">
          <span className="ui-stat-label">Total receivables</span>
          <strong className="ui-stat-value num">{formatPhp(totals.balance)}</strong>
          <span className="ui-stat-sub">Open sale balances</span>
        </div>
        <div className={`ui-stat${totals.overdue > 0 ? ' is-warning' : ''}`}>
          <span className="ui-stat-label">Overdue</span>
          <strong className="ui-stat-value num">{totals.overdue}</strong>
          <span className="ui-stat-sub">{totals.overdue === 0 ? 'Nothing overdue' : 'Needs follow-up'}</span>
        </div>
      </div>

      <Modal
        open={showForm && canManage}
        onClose={closeForm}
        title={editingId ? 'Edit customer' : 'New customer'}
        subtitle={
          editingId
            ? 'Update the customer record.'
            : canViewAll
              ? 'Saved to the branch selected in the header.'
              : 'Saved to your branch.'
        }
        busy={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={saving}>
              {editingId ? 'Save changes' : 'Add customer'}
            </Button>
          </>
        }
      >
        <form id="customer-form" className="stack" onSubmit={onSubmit}>
            {error ? <div className="error-banner">{error}</div> : null}
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
        </form>
      </Modal>

      <Modal
        open={Boolean(deletingAccount)}
        onClose={() => {
          if (!deleteBusy) setDeletingAccount(null)
        }}
        title="Delete customer"
        subtitle={deletingAccount?.customer.name}
        size="sm"
        busy={deleteBusy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingAccount(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              loading={deleteBusy}
              disabled={Boolean(deletingAccount && deletingAccount.balance > 0)}
            >
              Delete customer
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="muted">
            The customer is removed from this list and can no longer be selected on new sales. Existing sales,
            payments and receipts stay on file.
          </p>
          {deletingAccount && deletingAccount.balance > 0 ? (
            <div className="error-banner">
              This customer still has {formatPhp(deletingAccount.balance)} in open balances. Settle or reassign
              those sales before deleting the account.
            </div>
          ) : null}
        </div>
      </Modal>

      <Card
        ref={listTopRef}
        className="ui-scroll-target"
        title="Customer list"
        subtitle={`${filtered.length} of ${accounts.length} shown`}
      >
        <div className="ui-toolbar">
          <div className="ui-search">
            <Icon name="search" size={16} className="ui-search-icon" />
            <TextInput
              className="ui-search-input"
              id="cust-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, contact, or address"
              aria-label="Search customers"
            />
            {query ? (
              <button type="button" className="ui-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>
          <Button variant="secondary" onClick={exportBalances} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <SkeletonTable rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {query.trim() ? `No customers match “${query.trim()}”.` : 'No customers yet.'}
          </div>
        ) : (
          <Table className="ui-table-fixed">
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Open sales</th>
                <th>Balance</th>
                <th>Next due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customerPager.pageItems.map((a) => (
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
                      {canManage ? (
                        <>
                          <Button
                            variant="secondary"
                            className="ui-icon-btn"
                            aria-label={`Edit ${a.customer.name}`}
                            title="Edit customer"
                            onClick={(event) => {
                              event.stopPropagation()
                              startEdit(a)
                            }}
                          >
                            <Icon name="edit" size={16} />
                          </Button>
                          <Button
                            variant="danger"
                            className="ui-icon-btn"
                            aria-label={`Delete ${a.customer.name}`}
                            title="Delete customer"
                            onClick={(event) => {
                              event.stopPropagation()
                              setDeletingAccount(a)
                              setMessage(null)
                              setError(null)
                            }}
                          >
                            <Icon name="trash" size={16} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={customerPager.page}
          pageCount={customerPager.pageCount}
          pageSize={customerPager.pageSize}
          total={customerPager.total}
          start={customerPager.start}
          end={customerPager.end}
          onPage={customerPager.setPage}
          onPageSize={customerPager.setPageSize}
          noun="customer"
        />
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
