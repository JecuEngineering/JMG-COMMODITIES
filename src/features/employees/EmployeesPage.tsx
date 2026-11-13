import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { writeAuditLog } from '../../lib/audit'
import {
  ALL_ROLES,
  ROLE_LABELS,
  canEditEmployees,
  canManageEmployees,
  canViewEmployees,
} from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import type { AppRole, Branch, Profile } from '../../types/database'

interface EmployeeForm {
  full_name: string
  email: string
  password: string
  phone: string
  role: AppRole
  branch_id: string
  active: boolean
}

const BRANCH_SCOPED_ROLES: AppRole[] = ['branch_accountant', 'cashier', 'warehouse', 'employee']

const emptyForm: EmployeeForm = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  role: 'employee',
  branch_id: '',
  active: true,
}

async function readFunctionError(fnError: { message: string; context?: Response }): Promise<string> {
  const context = fnError.context
  if (context) {
    try {
      const body = (await context.clone().json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      // response body was not JSON — keep the default message
    }
  }
  return fnError.message
}

async function callAdminUpdate(body: Record<string, unknown>): Promise<{ error?: string }> {
  const { data, error: fnError } = await supabase.functions.invoke('admin-update-user', { body })
  if (fnError) {
    const notDeployed =
      fnError.name === 'FunctionsFetchError' || fnError.message.includes('Failed to send')
    if (notDeployed) {
      return {
        error:
          'Changing sign-in credentials needs the admin-update-user function. Deploy it with "npx supabase functions deploy admin-update-user --no-verify-jwt --project-ref ylpcutmsolvmloqjnwze".',
      }
    }
    return { error: await readFunctionError(fnError) }
  }
  if (data?.error) return { error: String(data.error) }
  return {}
}

export function EmployeesPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const canManage = canManageEmployees(role)
  const canEdit = canEditEmployees(role)
  const canView = canViewEmployees(role)

  const [employees, setEmployees] = useState<Profile[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const editingProfile = editingId ? employees.find((e) => e.id === editingId) ?? null : null

  const load = useCallback(async () => {
    setLoading(true)
    const [empRes, branchRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .is('deleted_at', null)
        .order('full_name'),
      supabase.from('branches').select('*').is('deleted_at', null).eq('active', true).order('name'),
    ])

    if (empRes.error) setError(empRes.error.message)
    else {
      setError(null)
      setEmployees((empRes.data as Profile[]) ?? [])
    }
    if (!branchRes.error) setBranches((branchRes.data as Branch[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to employees.</div>
      </div>
    )
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setMessage(null)
    setError(null)
  }

  function startEdit(profile: Profile) {
    setEditingId(profile.id)
    setForm({
      full_name: profile.full_name,
      email: profile.email ?? '',
      password: '',
      phone: profile.phone ?? '',
      role: profile.role,
      branch_id: profile.branch_id ?? '',
      active: profile.active,
    })
    setShowForm(true)
    setMessage(null)
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canEdit) return
    if (!form.full_name.trim()) {
      setError('Enter the employee name.')
      return
    }
    if (BRANCH_SCOPED_ROLES.includes(form.role) && !form.branch_id) {
      setError('Select a branch for this role.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)

    if (editingId) {
      const old = employees.find((e) => e.id === editingId)
      const nextEmail = form.email.trim()
      const emailChanged = nextEmail !== '' && nextEmail !== (old?.email ?? '')
      let credentialsChanged = false
      if (canManage && (emailChanged || form.password)) {
        const { error: credError } = await callAdminUpdate({
          userId: editingId,
          ...(emailChanged ? { email: nextEmail } : {}),
          ...(form.password ? { password: form.password } : {}),
        })
        if (credError) {
          setSaving(false)
          setError(credError)
          return
        }
        credentialsChanged = true
      }
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        branch_id: form.branch_id || null,
        active: form.active,
        email: nextEmail || null,
      }
      const { error: updateError } = await supabase.from('profiles').update(payload).eq('id', editingId)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      await writeAuditLog({
        action: form.active ? 'update' : 'deactivate',
        tableName: 'profiles',
        recordId: editingId,
        oldValue: old as unknown as Record<string, unknown>,
        newValue: { ...payload, credentials_changed: credentialsChanged },
      })
      setMessage(credentialsChanged ? 'Employee and sign-in credentials updated.' : 'Employee updated.')
      setShowForm(false)
      await load()
      return
    }

    if (!canManage) {
      setSaving(false)
      setError('Only System Admin can create employees.')
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke('create-employee', {
      body: {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
        branch_id: form.branch_id || null,
        phone: form.phone.trim() || null,
      },
    })

    setSaving(false)
    if (fnError) {
      const notDeployed =
        fnError.name === 'FunctionsFetchError' || fnError.message.includes('Failed to send')
      if (notDeployed) {
        setError(
          'Create-employee function is not deployed yet. Run "npx supabase functions deploy create-employee", or create the Auth user in Supabase Dashboard → Authentication → Users and edit their profile here.',
        )
        return
      }
      let detail = fnError.message
      const context = (fnError as { context?: Response }).context
      if (context) {
        try {
          const body = (await context.clone().json()) as { error?: string }
          if (body?.error) detail = body.error
        } catch {
          // response body was not JSON — keep the default message
        }
      }
      setError(detail)
      return
    }
    if (data?.error) {
      setError(String(data.error))
      return
    }

    setMessage('Employee created.')
    setShowForm(false)
    await load()
  }

  async function deactivate(profile: Profile) {
    if (!canEdit) return
    if (!canManage && profile.role === 'system_admin') {
      setError('Only System Admin can change a System Admin account.')
      return
    }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active: false })
      .eq('id', profile.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await writeAuditLog({
      action: 'deactivate',
      tableName: 'profiles',
      recordId: profile.id,
      oldValue: { active: true },
      newValue: { active: false },
    })
    setMessage(`${profile.full_name} deactivated.`)
    await load()
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Employees & Roles</h1>
          <p>
            Owner, General Accountant and System Admin can edit profiles. Passwords and login emails are
            System Admin only.
          </p>
        </div>
        {canManage ? <Button onClick={startCreate}>Add employee</Button> : null}
      </div>

      {error && !showForm ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <Modal
        open={showForm && canEdit}
        onClose={closeForm}
        title={editingId ? 'Edit employee' : 'Add employee'}
        subtitle={editingId ? 'Update this profile and role.' : 'Creates a sign-in account for the employee.'}
        busy={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" loading={saving}>
              {editingId ? 'Save changes' : 'Create employee'}
            </Button>
          </>
        }
      >
          <form id="employee-form" className="stack" onSubmit={onSubmit}>
            {error ? <div className="error-banner">{error}</div> : null}
            <Field label="Full name" htmlFor="emp-name">
              <TextInput
                id="emp-name"
                required
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="emp-email"
              hint={
                editingProfile?.role === 'system_admin'
                  ? 'The System Admin login email is changed in the Supabase dashboard.'
                  : editingId && !canManage
                    ? 'Only System Admin can change a sign-in email.'
                    : 'This is also the sign-in email.'
              }
            >
              <TextInput
                id="emp-email"
                type="email"
                required={!editingId}
                disabled={
                  (Boolean(editingId) && !canManage) || editingProfile?.role === 'system_admin'
                }
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            {!editingId ? (
              <Field label="Temporary password" htmlFor="emp-password" hint="Share securely with the employee">
                <TextInput
                  id="emp-password"
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </Field>
            ) : canManage ? (
              <Field
                label="New password"
                htmlFor="emp-password"
                hint="System Admin only. Leave blank to keep the current password."
              >
                <TextInput
                  id="emp-password"
                  type="password"
                  minLength={8}
                  placeholder="Leave blank to keep current password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </Field>
            ) : null}
            <Field label="Phone" htmlFor="emp-phone">
              <TextInput
                id="emp-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field label="Role" htmlFor="emp-role">
              <SelectInput
                id="emp-role"
                required
                value={form.role}
                disabled={editingProfile?.role === 'system_admin' && !canManage}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AppRole }))}
              >
                {ALL_ROLES.filter((r) => canManage || r !== 'system_admin').map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Branch" htmlFor="emp-branch" hint="Leave empty for HQ / all-branch roles">
              <SelectInput
                id="emp-branch"
                required={BRANCH_SCOPED_ROLES.includes(form.role)}
                value={form.branch_id}
                onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
              >
                <option value="">No branch (HQ)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {editingId ? (
              <Field label="Status" htmlFor="emp-active">
                <SelectInput
                  id="emp-active"
                  value={form.active ? 'active' : 'inactive'}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'active' }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Deactivated</option>
                </SelectInput>
              </Field>
            ) : null}
          </form>
      </Modal>

      <Card title="Directory" subtitle={loading ? undefined : `${employees.length} people`}>
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : employees.length === 0 ? (
          <div className="empty-state">No employees yet.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <strong>{emp.full_name}</strong>
                    <div className="faint">{emp.email}</div>
                  </td>
                  <td>{ROLE_LABELS[emp.role]}</td>
                  <td>{emp.branch?.name ?? 'HQ / All'}</td>
                  <td>
                    <Badge tone={emp.active ? 'default' : 'muted'}>{emp.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>
                    <div className="row">
                      {canEdit && (canManage || emp.role !== 'system_admin') ? (
                        <Button variant="secondary" onClick={() => startEdit(emp)}>
                          Edit
                        </Button>
                      ) : null}
                      {canEdit &&
                      emp.active &&
                      emp.id !== user!.id &&
                      (canManage || emp.role !== 'system_admin') ? (
                        <Button variant="danger" onClick={() => void deactivate(emp)}>
                          Deactivate
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
    </div>
  )
}
