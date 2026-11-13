import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, TextInput } from '../../components/Field'
import { Modal } from '../../components/Modal'
import { Table } from '../../components/Table'
import { writeAuditLog } from '../../lib/audit'
import { canManageSettings } from '../../lib/roles'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { AppRole, Branch } from '../../types/database'

interface BranchForm {
  name: string
  address: string
  contact: string
  latitude: string
  longitude: string
}

const emptyForm: BranchForm = { name: '', address: '', contact: '', latitude: '', longitude: '' }

function parseCoordinates(raw: string): { latitude: string; longitude: string } | null {
  const text = raw.trim()
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const lat = Number(match[1])
    const lng = Number(match[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { latitude: lat.toFixed(6), longitude: lng.toFixed(6) }
    }
  }
  return null
}

function branchCoords(branch: Branch): { latitude: number; longitude: number } | null {
  if (branch.latitude == null || branch.longitude == null) return null
  return { latitude: Number(branch.latitude), longitude: Number(branch.longitude) }
}

function mapLink(branch: Branch): string {
  const coords = branchCoords(branch)
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`
  }
  if (branch.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.name)}`
}

export function BranchesPanel() {
  const { user } = useAuth()
  const role = user!.profile.role as AppRole
  const canEdit = canManageSettings(role)
  const [branches, setBranches] = useState<Branch[]>([])
  const [form, setForm] = useState<BranchForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [mapNote, setMapNote] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)

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

  const preview = useMemo(() => {
    if (form.latitude.trim() === '' || form.longitude.trim() === '') return null
    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    const d = 0.008
    const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(6)).join('%2C')
    return {
      src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`,
      link: `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`,
    }
  }, [form.latitude, form.longitude])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setPinInput('')
    setMapNote(null)
    setError(null)
    setMessage(null)
    setShowForm(true)
  }

  function closeForm() {
    setEditingId(null)
    setForm(emptyForm)
    setPinInput('')
    setMapNote(null)
    setShowForm(false)
  }

  function startEdit(branch: Branch) {
    const coords = branchCoords(branch)
    setEditingId(branch.id)
    setForm({
      name: branch.name,
      address: branch.address ?? '',
      contact: branch.contact ?? '',
      latitude: coords ? String(coords.latitude) : '',
      longitude: coords ? String(coords.longitude) : '',
    })
    setPinInput('')
    setMapNote(null)
    setError(null)
    setMessage(null)
    setShowForm(true)
  }

  function applyPinInput(value: string) {
    setPinInput(value)
    const parsed = parseCoordinates(value)
    if (parsed) {
      setForm((f) => ({ ...f, ...parsed }))
      setMapNote('Coordinates set from the pasted link.')
    }
  }

  async function findOnMap() {
    const query = form.address.trim() || form.name.trim()
    if (!query) {
      setError('Enter the branch address first, then find it on the map.')
      return
    }
    setGeocoding(true)
    setError(null)
    setMapNote(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!res.ok) throw new Error(`Map search failed (${res.status}). Try again in a moment.`)
      const rows = (await res.json()) as { lat: string; lon: string; display_name?: string }[]
      if (!rows.length) {
        setError('Address not found on OpenStreetMap. Paste a Google Maps link or type the coordinates.')
        return
      }
      setForm((f) => ({
        ...f,
        latitude: Number(rows[0].lat).toFixed(6),
        longitude: Number(rows[0].lon).toFixed(6),
      }))
      setMapNote(rows[0].display_name ? `Matched: ${rows[0].display_name}` : 'Location found.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGeocoding(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canEdit) return
    if (!form.name.trim()) {
      setError('Enter the branch name.')
      return
    }
    const hasLat = form.latitude.trim() !== ''
    const hasLng = form.longitude.trim() !== ''
    if (hasLat !== hasLng) {
      setError('Enter both latitude and longitude, or leave both blank.')
      return
    }
    const latitude = hasLat ? Number(form.latitude) : null
    const longitude = hasLng ? Number(form.longitude) : null
    if (
      (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
      (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))
    ) {
      setError('Coordinates are out of range.')
      return
    }
    setSaving(true)
    setError(null)
    setMessage(null)
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      contact: form.contact.trim() || null,
      latitude: latitude == null ? null : Number(latitude.toFixed(6)),
      longitude: longitude == null ? null : Number(longitude.toFixed(6)),
    }

    if (editingId) {
      const old = branches.find((b) => b.id === editingId)
      const { error: updateError } = await supabase.from('branches').update(payload).eq('id', editingId)
      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      await writeAuditLog({
        action: 'update',
        tableName: 'branches',
        recordId: editingId,
        oldValue: old as unknown as Record<string, unknown>,
        newValue: payload,
      })
      setMessage('Branch updated.')
      setEditingId(null)
      setForm(emptyForm)
      setPinInput('')
      setMapNote(null)
      setShowForm(false)
      await load()
      return
    }

    const { data, error: insertError } = await supabase
      .from('branches')
      .insert({ ...payload, active: true })
      .select('*')
      .single()
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
    setForm(emptyForm)
    setPinInput('')
    setMapNote(null)
    setShowForm(false)
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
    <>
    <Card
      title="Branches"
      subtitle={canEdit ? 'Owner and System Admin can add branches' : 'View only'}
      action={canEdit ? <Button onClick={startCreate}>Add branch</Button> : null}
    >
      {error && !showForm ? <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div> : null}
      {message ? <div className="success-banner" style={{ marginBottom: 12 }}>{message}</div> : null}

      <Modal
        open={showForm && canEdit}
        onClose={closeForm}
        title={editingId ? 'Edit branch' : 'New branch'}
        subtitle="Set the address, then drop the pin so the website map points at the right spot."
        busy={saving}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" form="branch-form" loading={saving}>
              {editingId ? 'Save branch' : 'Add branch'}
            </Button>
          </>
        }
      >
        <form id="branch-form" className="stack" onSubmit={onSubmit}>
          {error ? <div className="error-banner">{error}</div> : null}
          <Field label="Branch name" htmlFor="branch-name">
            <TextInput
              id="branch-name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Main branch"
            />
          </Field>
          <Field
            label="Address"
            htmlFor="branch-address"
            hint="Use the full street address, then press Find on map to drop the pin."
          >
            <TextInput
              id="branch-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </Field>
          <Field label="Contact" htmlFor="branch-contact">
            <TextInput
              id="branch-contact"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
          </Field>

          <div className="stack" style={{ gap: 8 }}>
            <strong>Map pin</strong>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Button type="button" variant="secondary" loading={geocoding} onClick={() => void findOnMap()}>
                Find on map
              </Button>
              <TextInput
                aria-label="Paste Google Maps link or coordinates"
                placeholder="Paste Google Maps link or 14.599512, 120.984222"
                value={pinInput}
                onChange={(e) => applyPinInput(e.target.value)}
                style={{ flex: '1 1 260px' }}
              />
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Field label="Latitude" htmlFor="branch-lat">
                <TextInput
                  id="branch-lat"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                  placeholder="14.599512"
                />
              </Field>
              <Field label="Longitude" htmlFor="branch-lng">
                <TextInput
                  id="branch-lng"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  placeholder="120.984222"
                />
              </Field>
            </div>
            <span className="faint">
              Tip: open the spot in Google Maps, right-click the pin and copy the coordinates, then paste
              them here (or paste the whole maps link).
            </span>
            {mapNote ? <span className="faint">{mapNote}</span> : null}
            {preview ? (
              <div className="stack" style={{ gap: 6 }}>
                <iframe
                  title="Branch map preview"
                  src={preview.src}
                  loading="lazy"
                  style={{ width: '100%', height: 260, border: '1px solid var(--border)', borderRadius: 10 }}
                />
                <a href={preview.link} target="_blank" rel="noreferrer noopener" className="faint">
                  Open pin in Google Maps
                </a>
              </div>
            ) : null}
          </div>

        </form>
      </Modal>

      {branches.length === 0 ? (
        <div className="empty-state">No branches yet.</div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Contact</th>
              <th>Pin</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => {
              const coords = branchCoords(b)
              return (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.address ?? '—'}</td>
                  <td>{b.contact ?? '—'}</td>
                  <td>
                    <a href={mapLink(b)} target="_blank" rel="noreferrer noopener" className="faint">
                      {coords
                        ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`
                        : 'No pin — set address'}
                    </a>
                  </td>
                  <td>
                    <Badge tone={b.active ? 'default' : 'muted'}>{b.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>
                    <div className="row">
                      {canEdit ? (
                        <Button variant="secondary" onClick={() => startEdit(b)}>
                          Edit
                        </Button>
                      ) : null}
                      {canEdit && b.active ? (
                        <Button variant="danger" onClick={() => void deactivate(b)}>
                          Deactivate
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </Card>
    </>
  )
}
