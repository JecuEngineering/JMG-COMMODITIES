import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, TextInput } from '../../components/Field'
import { Table } from '../../components/Table'
import { writeAuditLog } from '../../lib/audit'
import { canManageSettings } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { AppRole, Branch } from '../../types/database'

export function BranchesPanel() {
  const { user } = useAuth()
  const role = user!.profile.role as AppRole
  const canEdit = canManageSettings(role)
  const [branches, setBranches] = useState<Branch[]>([])
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .order('name')
    if (fetchError) setError(fetchError.message)
    else setBranches((data as Branch[]) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(event: FormEvent) {
    event.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    setMessage(null)
    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      contact: contact.trim() || null,
      active: true,
    }
    const { data, error: insertError } = await supabase.from('branches').insert(payload).select('*').single()
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    await writeAuditLog({
      action: 'create',
      tableName: 'branches',
      recordId: data.id,
      newValue: payload,
    })
    setName('')
    setAddress('')
    setContact('')
    setMessage('Branch added.')
    await load()
  }

  async function deactivate(branch: Branch) {
    if (!canEdit) return
    const { error: updateError } = await supabase
      .from('branches')
      .update({ active: false })
      .eq('id', branch.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await writeAuditLog({
      action: 'deactivate',
      tableName: 'branches',
      recordId: branch.id,
      oldValue: { active: true },
      newValue: { active: false },
    })
    setMessage(`${branch.name} deactivated.`)
    await load()
  }

  return (
    <Card title="Branches" subtitle={canEdit ? 'Owner and System Admin can add branches' : 'View only'}>
      {error ? <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="success-banner" style={{ marginBottom: 12 }}>{message}</div> : null}

      {canEdit ? (
        <form className="stack" onSubmit={onAdd} style={{ marginBottom: 16 }}>
          <Field label="Branch name" htmlFor="branch-name">
            <TextInput
              id="branch-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Main branch"
            />
          </Field>
          <Field label="Address" htmlFor="branch-address">
            <TextInput id="branch-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Contact" htmlFor="branch-contact">
            <TextInput id="branch-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </Field>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add branch'}
          </Button>
        </form>
      ) : null}

      {branches.length === 0 ? (
        <div className="empty-state">No branches yet.</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Contact</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.address ?? '—'}</td>
                <td>{b.contact ?? '—'}</td>
                <td>
                  <Badge tone={b.active ? 'default' : 'muted'}>{b.active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td>
                  {canEdit && b.active ? (
                    <Button variant="danger" onClick={() => void deactivate(b)}>
                      Deactivate
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
