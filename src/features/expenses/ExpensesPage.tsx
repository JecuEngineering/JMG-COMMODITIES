import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { fetchBranches } from '../inventory/inventoryApi'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv, downloadExcel, printPage } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { canManageExpenses, canViewAllBranchesExpenses, canViewExpenses } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { Branch } from '../../types/database'

interface ExpenseCategory {
  id: string
  name: string
}

interface Expense {
  id: string
  branch_id: string
  category_id: string | null
  expense_date: string
  amount: number
  payee: string | null
  notes: string | null
  receipt_path: string | null
  branch?: Branch | null
  category?: ExpenseCategory | null
}

export function ExpensesPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canView = canViewExpenses(role)
  const canManage = canManageExpenses(role)
  const canViewAll = canViewAllBranchesExpenses(role)
  const profileBranchId = user!.profile.branch_id

  const [branches, setBranches] = useState<Branch[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [branchId, setBranchId] = useState(profileBranchId ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [amount, setAmount] = useState('')
  const [payee, setPayee] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [toDate, setToDate] = useState(todayInputValue())
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const b = await fetchBranches()
      setBranches(b)
      setBranchId((prev) => prev || profileBranchId || b[0]?.id || '')

      const [catRes, expRes] = await Promise.all([
        supabase.from('expense_categories').select('*').eq('active', true).order('name'),
        supabase
          .from('expenses')
          .select('*, branch:branches(*), category:expense_categories(*)')
          .is('deleted_at', null)
          .order('expense_date', { ascending: false }),
      ])
      if (catRes.error) throw catRes.error
      if (expRes.error) throw expRes.error
      setCategories((catRes.data as ExpenseCategory[]) ?? [])
      setExpenses((expRes.data as Expense[]) ?? [])
      setCategoryId((prev) => prev || catRes.data?.[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [profileBranchId])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((ex) => {
        if (fromDate && ex.expense_date < fromDate) return false
        if (toDate && ex.expense_date > toDate) return false
        if (filterCategoryId && ex.category_id !== filterCategoryId) return false
        return true
      }),
    [expenses, fromDate, toDate, filterCategoryId],
  )

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((sum, ex) => sum + Number(ex.amount), 0),
    [filteredExpenses],
  )

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to expenses.</div>
      </div>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    setError(null)
    setMessage(null)
    if (!date) {
      setError('Enter the expense date.')
      return
    }
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    try {
      let receiptPath: string | null = null
      if (file) {
        const path = `${branchId}/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage.from('expense-receipts').upload(path, file)
        if (upErr) throw upErr
        receiptPath = path
      }

      const { error: insErr } = await supabase.from('expenses').insert({
        branch_id: branchId,
        category_id: categoryId || null,
        expense_date: date,
        amount: Number(amount),
        payee: payee || null,
        notes: notes || null,
        receipt_path: receiptPath,
        created_by: user!.id,
      })
      if (insErr) throw insErr
      setFormOpen(false)
      setMessage('Expense saved.')
      setAmount('')
      setPayee('')
      setNotes('')
      setFile(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const branchOptions = canViewAll ? branches : branches.filter((b) => b.id === profileBranchId)

  function exportRows() {
    return filteredExpenses.map((ex) => [
      ex.expense_date,
      ex.branch?.name ?? '',
      ex.category?.name ?? '',
      ex.payee ?? '',
      ex.notes ?? '',
      Number(ex.amount).toFixed(2),
    ])
  }

  function onExportExcel() {
    downloadExcel(
      `expenses-${fromDate}-to-${toDate}.xls`,
      'Expenses',
      ['Date', 'Branch', 'Category', 'Payee', 'Notes', 'Amount'],
      [...exportRows(), ['', '', '', '', 'TOTAL', filteredTotal.toFixed(2)]],
    )
  }

  function onExportCsv() {
    downloadCsv(
      `expenses-${fromDate}-to-${toDate}.csv`,
      ['Date', 'Branch', 'Category', 'Payee', 'Notes', 'Amount'],
      [...exportRows(), ['', '', '', '', 'TOTAL', filteredTotal.toFixed(2)]],
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Expenses</h1>
          <p>Categories, amounts, and optional receipt photos.</p>
        </div>
        {canManage ? <Button onClick={() => setFormOpen(true)}>Add expense</Button> : null}
      </div>

      {error && !formOpen ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <Modal
        open={formOpen && canManage}
        onClose={() => setFormOpen(false)}
        title="Encode expense"
        subtitle="Record a branch expense and attach the receipt."
        busy={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form">
              Save expense
            </Button>
          </>
        }
      >
          <form id="expense-form" className="stack" onSubmit={onSubmit}>
            {error ? <div className="error-banner">{error}</div> : null}
            <Field label="Branch" htmlFor="ex-branch">
              <SelectInput id="ex-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Category" htmlFor="ex-cat">
              <SelectInput id="ex-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Date" htmlFor="ex-date">
              <TextInput id="ex-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Amount (₱)" htmlFor="ex-amt">
              <TextInput
                id="ex-amt"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Payee" htmlFor="ex-payee">
              <TextInput id="ex-payee" value={payee} onChange={(e) => setPayee(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="ex-notes">
              <TextArea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="Receipt photo" htmlFor="ex-file">
              <input id="ex-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          </form>
      </Modal>

      <Card title="Filters" className="no-print">
        <div className="row" style={{ flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <Field label="From" htmlFor="ex-from">
            <TextInput id="ex-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="ex-to">
            <TextInput id="ex-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="ex-filter-cat">
            <SelectInput
              id="ex-filter-cat"
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Button variant="secondary" onClick={onExportExcel}>
            Export Excel
          </Button>
          <Button variant="secondary" onClick={onExportCsv}>
            Export CSV
          </Button>
          <Button variant="ghost" onClick={printPage}>
            Print / PDF
          </Button>
        </div>
      </Card>

      <Card
        title="Expense list"
        subtitle={`${filteredExpenses.length} entr${filteredExpenses.length === 1 ? 'y' : 'ies'} · Total ${formatPhp(filteredTotal)}`}
      >
        {filteredExpenses.length === 0 ? (
          <div className="empty-state">No expenses in this range.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Branch</th>
                <th>Category</th>
                <th>Payee</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((ex) => (
                <tr key={ex.id}>
                  <td>{formatDate(ex.expense_date)}</td>
                  <td>{ex.branch?.name ?? '—'}</td>
                  <td>{ex.category?.name ?? '—'}</td>
                  <td>{ex.payee ?? '—'}</td>
                  <td>{formatPhp(ex.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total</strong></td>
                <td><strong>{formatPhp(filteredTotal)}</strong></td>
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </div>
  )
}
