import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Pagination, usePaged } from '../../components/Pagination'
import { ScopePill } from '../../components/ScopePill'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { canViewAuditLog } from '../../lib/roles'
import { downloadCsv } from '../../lib/export'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/dates'
import type { Profile } from '../../types/database'

interface AuditRow {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_value: unknown
  new_value: unknown
  created_at: string
}

function preview(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function AuditLogPage() {
  const { user } = useAuth()
  const canView = canViewAuditLog(user!.profile.role)

  const [rows, setRows] = useState<AuditRow[]>([])
  const [people, setPeople] = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!canView) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [logRes, profileRes] = await Promise.all([
          supabase
            .from('audit_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.from('profiles').select('id, full_name').is('deleted_at', null),
        ])
        if (logRes.error) throw logRes.error
        if (profileRes.error) throw profileRes.error
        if (cancelled) return
        setRows((logRes.data as AuditRow[]) ?? [])
        setPeople((profileRes.data as Pick<Profile, 'id' | 'full_name'>[]) ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the audit log.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [canView])

  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people])
  const tableOptions = useMemo(() => [...new Set(rows.map((r) => r.table_name))].sort(), [rows])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (tableFilter && row.table_name !== tableFilter) return false
      if (actionFilter && !row.action.toLowerCase().includes(actionFilter.trim().toLowerCase())) return false
      if (!needle) return true
      const haystack = [
        row.action,
        row.table_name,
        row.record_id ?? '',
        row.user_id ? nameById.get(row.user_id) ?? '' : '',
        preview(row.new_value),
        preview(row.old_value),
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [rows, tableFilter, actionFilter, search, nameById])

  const pager = usePaged(filtered, 10)

  function onExport() {
    downloadCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      ['When', 'User', 'Action', 'Table', 'Record', 'Old value', 'New value'],
      filtered.map((row) => [
        formatDateTime(row.created_at),
        row.user_id ? nameById.get(row.user_id) ?? row.user_id : 'System',
        row.action,
        row.table_name,
        row.record_id ?? '',
        preview(row.old_value),
        preview(row.new_value),
      ]),
    )
  }

  if (!canView) {
    return <div className="error-banner">You do not have access to the audit log.</div>
  }

  return (
    <div className="app-page stack" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <ScopePill label="Company-wide" />
          <h1>Audit log</h1>
          <p className="muted">Every recorded action, newest first. Showing the latest 500 entries.</p>
        </div>
        <Button variant="secondary" onClick={onExport} disabled={filtered.length === 0}>
          Export CSV
        </Button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <Card title="Filters" subtitle={`${filtered.length} of ${rows.length} entries shown`}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <Field label="Table" htmlFor="audit-table">
              <SelectInput
                id="audit-table"
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
              >
                <option value="">All tables</option>
                {tableOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <Field label="Action contains" htmlFor="audit-action">
              <TextInput
                id="audit-action"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                placeholder="e.g. update, create, receive"
              />
            </Field>
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 180 }}>
            <Field label="Search" htmlFor="audit-search">
              <TextInput
                id="audit-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="User, record id, or value"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Entries">
        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <p className="faint">No audit entries match the filters.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Table</th>
                <th>Record</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((row) => (
                <tr key={row.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.created_at)}</td>
                  <td>{row.user_id ? nameById.get(row.user_id) ?? 'Unknown user' : 'System'}</td>
                  <td><Badge tone="muted">{row.action}</Badge></td>
                  <td>{row.table_name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {row.record_id ? `${row.record_id.slice(0, 8)}…` : '—'}
                  </td>
                  <td style={{ maxWidth: 340 }}>
                    <details>
                      <summary className="faint" style={{ cursor: 'pointer' }}>View</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.75rem', marginTop: 6 }}>
                        {row.old_value != null ? `old: ${preview(row.old_value)}\n` : ''}
                        {`new: ${preview(row.new_value)}`}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {filtered.length > 0 ? (
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            pageSize={pager.pageSize}
            total={pager.total}
            start={pager.start}
            end={pager.end}
            onPage={pager.setPage}
            onPageSize={pager.setPageSize}
            noun="entry"
          />
        ) : null}
      </Card>
    </div>
  )
}
