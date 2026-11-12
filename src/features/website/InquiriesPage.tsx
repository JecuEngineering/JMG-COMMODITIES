import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, TextArea } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import {
  fetchInquiries,
  updateInquiryStatus,
  type Inquiry,
  type InquiryStatus,
} from './inquiriesApi'

const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
}

const STATUS_COLORS: Record<InquiryStatus, string> = {
  new: 'var(--color-info)',
  read: 'var(--color-warning)',
  replied: 'var(--color-ok)',
  archived: 'var(--color-ink-faint)',
}

type FilterId = 'new' | 'read' | 'replied' | 'archived' | 'all'

export function InquiriesPage() {
  const { user } = useAuth()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [filter, setFilter] = useState<FilterId>('new')
  const [selected, setSelected] = useState<Inquiry | null>(null)
  const [replyNotes, setReplyNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInquiries()
      setInquiries(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered =
    filter === 'all' ? inquiries : inquiries.filter((i) => i.status === filter)

  const counts: Record<FilterId, number> = {
    new: inquiries.filter((i) => i.status === 'new').length,
    read: inquiries.filter((i) => i.status === 'read').length,
    replied: inquiries.filter((i) => i.status === 'replied').length,
    archived: inquiries.filter((i) => i.status === 'archived').length,
    all: inquiries.length,
  }

  async function markAs(status: InquiryStatus) {
    if (!selected) return
    setError(null)
    setMessage(null)
    try {
      await updateInquiryStatus(
        selected.id,
        status,
        status === 'replied' ? replyNotes : undefined,
        status === 'replied' ? user!.id : undefined,
      )
      setMessage(`Marked as ${STATUS_LABELS[status]}.`)
      setReplyNotes('')
      await load()
      // Refresh selected with updated data
      setSelected((prev) =>
        prev ? { ...prev, status, reply_notes: status === 'replied' ? replyNotes : prev.reply_notes } : null,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Auto-mark new → read when opened
  async function openInquiry(inq: Inquiry) {
    setSelected(inq)
    setReplyNotes(inq.reply_notes ?? '')
    if (inq.status === 'new') {
      try {
        await updateInquiryStatus(inq.id, 'read')
        setInquiries((prev) =>
          prev.map((i) => (i.id === inq.id ? { ...i, status: 'read' } : i)),
        )
      } catch {
        // non-blocking
      }
    }
  }

  const FILTERS: { id: FilterId; label: string }[] = [
    { id: 'new', label: `New (${counts.new})` },
    { id: 'read', label: `Read (${counts.read})` },
    { id: 'replied', label: `Replied (${counts.replied})` },
    { id: 'archived', label: `Archived (${counts.archived})` },
    { id: 'all', label: `All (${counts.all})` },
  ]

  function exportInquiries() {
    downloadCsv(
      `website-inquiries-${todayInputValue()}.csv`,
      ['Date', 'Name', 'Contact', 'Area of interest', 'Status', 'Message', 'Reply notes'],
      filtered.map((i) => [
        i.created_at,
        i.name,
        i.contact,
        i.branch_interest ?? '',
        STATUS_LABELS[i.status],
        i.message,
        i.reply_notes ?? '',
      ]),
    )
  }

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Website Inquiries</h1>
          <p>Messages sent from the public contact form.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <ChipRow>
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            active={filter === f.id}
            onClick={() => {
              setFilter(f.id)
              setSelected(null)
            }}
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {loading && inquiries.length === 0 ? <SkeletonTable rows={4} cols={4} /> : null}

      <Card
        title={`Inquiries (${filtered.length})`}
        action={
          filtered.length > 0 ? (
            <Button variant="secondary" onClick={exportInquiries}>
              Export CSV
            </Button>
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <div className="empty-state">No inquiries in this category.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Area</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inq) => (
                <tr
                  key={inq.id}
                  onClick={() => void openInquiry(inq)}
                  style={{
                    cursor: 'pointer',
                    fontWeight: inq.status === 'new' ? 600 : 400,
                  }}
                >
                  <td>{formatDate(inq.created_at)}</td>
                  <td>{inq.name}</td>
                  <td>{inq.contact}</td>
                  <td>{inq.branch_interest ?? '—'}</td>
                  <td>
                    <span
                      style={{
                        color: STATUS_COLORS[inq.status],
                        fontWeight: 600,
                        fontSize: '0.85rem',
                      }}
                    >
                      {STATUS_LABELS[inq.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {selected ? (
        <Card
          title={`From: ${selected.name}`}
          subtitle={`${selected.contact}${selected.branch_interest ? ` · ${selected.branch_interest}` : ''} · ${formatDate(selected.created_at)}`}
        >
          <div
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-control)',
              padding: '16px',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {selected.message}
          </div>

          {selected.reply_notes ? (
            <div style={{ marginTop: 16 }}>
              <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                Reply notes
              </p>
              <div
                style={{
                  background: 'var(--color-ok-soft)',
                  border: '1px solid #a6f4c5',
                  borderRadius: 'var(--radius-control)',
                  padding: '12px 14px',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selected.reply_notes}
              </div>
            </div>
          ) : null}

          <div className="stack" style={{ marginTop: 20 }}>
            {selected.status !== 'replied' && selected.status !== 'archived' ? (
              <Field label="Reply / notes (optional)" htmlFor="inq-reply">
                <TextArea
                  id="inq-reply"
                  value={replyNotes}
                  onChange={(e) => setReplyNotes(e.target.value)}
                  placeholder="Notes about this inquiry or what you replied…"
                />
              </Field>
            ) : null}

            <div className="row" style={{ gap: 8 }}>
              {selected.status !== 'replied' && selected.status !== 'archived' ? (
                <Button onClick={() => void markAs('replied')}>Mark as replied</Button>
              ) : null}
              {selected.status !== 'archived' ? (
                <Button variant="secondary" onClick={() => void markAs('archived')}>
                  Archive
                </Button>
              ) : null}
              {selected.status === 'archived' ? (
                <Button variant="secondary" onClick={() => void markAs('new')}>
                  Reopen
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

