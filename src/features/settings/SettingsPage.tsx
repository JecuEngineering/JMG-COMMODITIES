import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, TextArea, TextInput } from '../../components/Field'
import { useAuth } from '../auth/AuthContext'
import { writeAuditLog } from '../../lib/audit'
import { canManageSettings, canViewSettings } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { BranchesPanel } from '../branches/BranchesPanel'
import { useCompanySettings } from './useCompanySettings'

export function SettingsPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const { settings, loading, refresh } = useCompanySettings()
  const canEdit = canManageSettings(role)
  const canView = canViewSettings(role)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [tin, setTin] = useState('')
  const [contacts, setContacts] = useState('')
  const [drPrefix, setDrPrefix] = useState('DR')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!settings) return
    setName(settings.name)
    setAddress(settings.address ?? '')
    setTin(settings.tin ?? '')
    setContacts(settings.contacts ?? '')
    setDrPrefix(settings.dr_prefix ?? 'DR')
    setLogoUrl(settings.logo_url)
  }, [settings])

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to company settings.</div>
      </div>
    )
  }

  async function onUploadLogo(file: File) {
    if (!canEdit || !settings) return
    setUploading(true)
    setError(null)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `logo-${settings.id}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('company-assets').getPublicUrl(path)
    const publicUrl = `${data.publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase
      .from('company_settings')
      .update({ logo_url: publicUrl, updated_by: user!.id, updated_at: new Date().toISOString() })
      .eq('id', settings.id)

    setUploading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setLogoUrl(publicUrl)
    await writeAuditLog({
      action: 'update',
      tableName: 'company_settings',
      recordId: settings.id,
      oldValue: { logo_url: settings.logo_url },
      newValue: { logo_url: publicUrl },
    })
    setMessage('Logo updated. It will appear on login and in the header.')
    await refresh()
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!canEdit || !settings) return
    setSaving(true)
    setError(null)
    setMessage(null)

    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      tin: tin.trim() || null,
      contacts: contacts.trim() || null,
      dr_prefix: drPrefix.trim() || 'DR',
      updated_by: user!.id,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('company_settings')
      .update(payload)
      .eq('id', settings.id)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    await writeAuditLog({
      action: 'update',
      tableName: 'company_settings',
      recordId: settings.id,
      oldValue: settings as unknown as Record<string, unknown>,
      newValue: payload,
    })
    setMessage('Company settings saved.')
    await refresh()
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Company details and logo used on login, header, and printed documents.</p>
        </div>
      </div>

      {loading ? <p className="muted">Loading settings…</p> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <Card title="Company profile" subtitle={canEdit ? 'Editable by Owner and System Admin' : 'View only'}>
        <form className="stack" onSubmit={onSave}>
          <div className="row" style={{ alignItems: 'center' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Company logo" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            ) : (
              <div className="shell-logo-fallback" aria-hidden>
                JMG
              </div>
            )}
            {canEdit ? (
              <label className="ui-btn ui-btn-secondary" style={{ cursor: 'pointer' }}>
                {uploading ? 'Uploading…' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  hidden
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void onUploadLogo(file)
                  }}
                />
              </label>
            ) : null}
          </div>

          <Field label="Company name" htmlFor="company-name">
            <TextInput
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={!canEdit}
            />
          </Field>
          <Field label="Address" htmlFor="company-address">
            <TextArea
              id="company-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="TIN" htmlFor="company-tin">
            <TextInput id="company-tin" value={tin} onChange={(e) => setTin(e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Contacts" htmlFor="company-contacts" hint="Phone numbers / email">
            <TextInput
              id="company-contacts"
              value={contacts}
              onChange={(e) => setContacts(e.target.value)}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Delivery Receipt prefix" htmlFor="dr-prefix">
            <TextInput
              id="dr-prefix"
              value={drPrefix}
              onChange={(e) => setDrPrefix(e.target.value)}
              disabled={!canEdit}
            />
          </Field>

          {canEdit ? (
            <div className="row">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          ) : null}
        </form>
      </Card>

      <BranchesPanel />
    </div>
  )
}
