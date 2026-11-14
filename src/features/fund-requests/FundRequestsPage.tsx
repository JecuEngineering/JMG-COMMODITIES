import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Chip, ChipRow } from '../../components/Chip'
import { Field, SelectInput, TextArea, TextInput } from '../../components/Field'
import { SkeletonTable } from '../../components/Loading'
import { Modal } from '../../components/Modal'
import { Pagination, usePaged } from '../../components/Pagination'
import { Table } from '../../components/Table'
import { useAuth } from '../auth/AuthContext'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadCsv } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import {
  canApproveFundRequest,
  canCreateFundRequest,
  canReleaseFundRequest,
  canReviewFundRequest,
  canViewAllBranchesFundRequests,
  canViewFundRequests,
} from '../../lib/roles'
import {
  approveFundRequest,
  createFundRequest,
  fetchFundRequests,
  fetchSteps,
  forwardFundRequest,
  releaseFundRequest,
  rejectFundRequest,
  submitFundRequest,
  type FundRequest,
  type FundRequestStep,
  type FundRequestType,
  type ReleaseMethod,
} from './fundRequestsApi'

const CATEGORIES = ['Supplies', 'Transportation', 'Equipment', 'Repairs', 'Utilities', 'Food', 'Other']

const TYPE_LABELS: Record<FundRequestType, string> = {
  cash_advance: 'Cash advance',
  reimbursement: 'Reimbursement',
  purchase: 'Purchase',
  other: 'Other',
}

const STATUS_LABELS: Record<FundRequest['status'], string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  forwarded: 'Forwarded to Owner',
  approved: 'Approved',
  released: 'Released',
  liquidated: 'Liquidated',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<FundRequest['status'], string> = {
  draft: 'var(--color-ink-faint)',
  submitted: 'var(--color-info)',
  forwarded: 'var(--color-warning)',
  approved: 'var(--color-ok)',
  released: 'var(--color-jade)',
  liquidated: 'var(--color-jade)',
  rejected: 'var(--color-danger)',
}

type TabId = 'mine' | 'review' | 'approve' | 'release' | 'all'

export function FundRequestsPage() {
  const { user } = useAuth()
  const role = user!.profile.role
  const profileBranchId = user!.profile.branch_id
  const canView = canViewFundRequests(role)
  const canCreate = canCreateFundRequest(role)
  const canReview = canReviewFundRequest(role)
  const canApprove = canApproveFundRequest(role)
  const canRelease = canReleaseFundRequest(role)
  const canViewAll = canViewAllBranchesFundRequests(role)

  const [tab, setTab] = useState<TabId>('mine')
  const [requests, setRequests] = useState<FundRequest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [steps, setSteps] = useState<FundRequestStep[]>([])

  // create form
  const [requestOpen, setRequestOpen] = useState(false)
  const [fType, setFType] = useState<FundRequestType>('cash_advance')
  const [fPurpose, setFPurpose] = useState('')
  const [fCategory, setFCategory] = useState(CATEGORIES[0])
  const [fAmount, setFAmount] = useState('')
  const [fNotes, setFNotes] = useState('')

  // action forms
  const [rejectReason, setRejectReason] = useState('')
  const [releaseMethod, setReleaseMethod] = useState<ReleaseMethod>('online_transfer')
  const [releaseRef, setReleaseRef] = useState('')
  const [releaseBank, setReleaseBank] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchFundRequests()
      setRequests(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canView) void load()
  }, [canView, load])

  const loadDetail = useCallback(async (id: string) => {
    try {
      setSteps(await fetchSteps(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const filtered = useMemo(() => {
    switch (tab) {
      case 'mine':
        return requests.filter((r) => r.requester_id === user!.id)
      case 'review':
        return requests.filter((r) => r.status === 'submitted')
      case 'approve':
        return requests.filter((r) => r.status === 'forwarded')
      case 'release':
        return requests.filter((r) => r.status === 'approved')
      case 'all':
        return canViewAll ? requests : requests.filter((r) => r.branch_id === profileBranchId)
      default:
        return requests
    }
  }, [requests, tab, user, canViewAll, profileBranchId])

  const pager = usePaged(filtered, 10)

  if (!canView) {
    return (
      <div className="app-page">
        <div className="error-banner">You do not have access to fund requests.</div>
      </div>
    )
  }

  const selected = requests.find((r) => r.id === selectedId) ?? null

  function exportRequests() {
    downloadCsv(
      `fund-requests-${todayInputValue()}.csv`,
      ['Date', 'Branch', 'Requester', 'Purpose', 'Category', 'Type', 'Amount', 'Status', 'Released', 'Release ref'],
      filtered.map((r) => [
        formatDate(r.created_at),
        r.branch?.name ?? '',
        r.requester?.full_name ?? '',
        r.purpose,
        r.category ?? '',
        TYPE_LABELS[r.request_type] ?? r.request_type,
        r.amount,
        STATUS_LABELS[r.status],
        r.released_at ? formatDate(r.released_at) : '',
        r.release_reference ?? '',
      ]),
    )
  }

  function resetForms() {
    setFType('cash_advance')
    setFPurpose('')
    setFAmount('')
    setFNotes('')
    setRejectReason('')
    setReleaseRef('')
    setReleaseBank('')
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    if (!canCreate) return
    setError(null)
    setMessage(null)
    try {
      const req = await createFundRequest({
        requesterId: user!.id,
        branchId: profileBranchId ?? '',
        purpose: fPurpose,
        category: fCategory,
        requestType: fType,
        amount: Number(fAmount),
        notes: fNotes,
      })
      setRequestOpen(false)
      setMessage('Draft created. Submit it when ready.')
      resetForms()
      setSelectedId(req.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onSubmit(id: string) {
    setError(null)
    setMessage(null)
    try {
      await submitFundRequest(id)
      setMessage('Submitted to Branch Accountant.')
      await load()
      await loadDetail(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onForward(id: string) {
    setError(null)
    setMessage(null)
    try {
      await forwardFundRequest(id)
      setMessage('Forwarded to Owner for approval.')
      await load()
      await loadDetail(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onReject(id: string) {
    if (!rejectReason.trim()) {
      setError('Please provide a rejection reason.')
      return
    }
    setError(null)
    setMessage(null)
    try {
      await rejectFundRequest(id, rejectReason, user!.id)
      setMessage('Rejected.')
      setRejectReason('')
      await load()
      await loadDetail(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onApprove(id: string) {
    setError(null)
    setMessage(null)
    try {
      await approveFundRequest(id)
      setMessage('Approved. Waiting for General Accountant to release.')
      await load()
      await loadDetail(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onRelease(id: string) {
    if (!releaseRef.trim()) {
      setError('Please provide a reference number.')
      return
    }
    setError(null)
    setMessage(null)
    try {
      await releaseFundRequest({
        id,
        method: releaseMethod,
        reference: releaseRef,
        bank: releaseBank,
        releasedBy: user!.id,
      })
      setMessage('Released.')
      setReleaseRef('')
      setReleaseBank('')
      await load()
      await loadDetail(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const tabs: { id: TabId; label: string; show: boolean }[] = [
    { id: 'mine', label: 'My requests', show: true },
    { id: 'review', label: `For review${canReview ? ` (${requests.filter((r) => r.status === 'submitted').length})` : ''}`, show: canReview },
    { id: 'approve', label: `For approval${canApprove ? ` (${requests.filter((r) => r.status === 'forwarded').length})` : ''}`, show: canApprove },
    { id: 'release', label: `For release${canRelease ? ` (${requests.filter((r) => r.status === 'approved').length})` : ''}`, show: canRelease },
    { id: 'all', label: 'All', show: canViewAll || canReview },
  ]

  return (
    <div className="app-page stack">
      <div className="page-header">
        <div>
          <h1>Fund Requests</h1>
          <p>Request → BA review → Owner approve → GA release → Liquidation.</p>
        </div>
        {canCreate ? <Button onClick={() => setRequestOpen(true)}>New request</Button> : null}
      </div>

      {error && !requestOpen ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <ChipRow>
        {tabs.filter((t) => t.show).map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => { setTab(t.id); setSelectedId(null) }}>
            {t.label}
          </Chip>
        ))}
      </ChipRow>

      {canCreate && tab === 'mine' ? (
        <Modal
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          title="New fund request"
          subtitle="Saved as a draft — submit it when you are ready for review."
          footer={
            <>
              <Button variant="secondary" onClick={() => setRequestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="fund-request-form">
                Save draft
              </Button>
            </>
          }
        >
          <form id="fund-request-form" className="stack" onSubmit={onCreate}>
            {error ? <div className="error-banner">{error}</div> : null}
            <Field label="Request type" htmlFor="fr-type">
              <SelectInput
                id="fr-type"
                value={fType}
                onChange={(e) => setFType(e.target.value as FundRequestType)}
              >
                {(Object.keys(TYPE_LABELS) as FundRequestType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Purpose" htmlFor="fr-purpose">
              <TextInput id="fr-purpose" required value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="fr-category">
              <SelectInput id="fr-category" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Amount (₱)" htmlFor="fr-amount">
              <TextInput
                id="fr-amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
              />
            </Field>
            <Field label="Notes" htmlFor="fr-notes">
              <TextArea id="fr-notes" value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
            </Field>
          </form>
        </Modal>
      ) : null}

      {loading && requests.length === 0 ? <SkeletonTable rows={5} cols={5} /> : null}

      <Card
        title={`Requests (${filtered.length})`}
        action={
          filtered.length > 0 ? (
            <Button variant="secondary" onClick={exportRequests}>
              Export CSV
            </Button>
          ) : undefined
        }
      >
        {filtered.length === 0 ? (
          <div className="empty-state">No requests here.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                {canViewAll ? <th>Branch</th> : null}
                <th>Requester</th>
                <th>Purpose</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>{formatDate(r.created_at)}</td>
                  {canViewAll ? <td>{r.branch?.name ?? '—'}</td> : null}
                  <td>{r.requester?.full_name ?? '—'}</td>
                  <td>{r.purpose}</td>
                  <td>{TYPE_LABELS[r.request_type] ?? r.request_type}</td>
                  <td>{formatPhp(r.amount)}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[r.status], fontWeight: 600 }}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          pageSize={pager.pageSize}
          total={pager.total}
          start={pager.start}
          end={pager.end}
          onPage={pager.setPage}
          onPageSize={pager.setPageSize}
          noun="request"
        />
      </Card>

      {selected ? (
        <Card
          title={`Request — ${selected.purpose}`}
          subtitle={`${TYPE_LABELS[selected.request_type] ?? selected.request_type} · ${STATUS_LABELS[selected.status]}`}
        >
          <div className="row" style={{ flexWrap: 'wrap', gap: 24 }}>
            <div>
              <p className="muted">Amount requested</p>
              <strong style={{ fontSize: 20 }}>{formatPhp(selected.amount)}</strong>
            </div>
            {selected.released_at ? (
              <div>
                <p className="muted">Released</p>
                <strong>{formatPhp(selected.amount)}</strong>
                <p className="faint">
                  {selected.release_method === 'check' ? 'Check' : 'Online transfer'}
                  {selected.release_reference ? ` · Ref: ${selected.release_reference}` : ''}
                  {selected.release_bank ? ` · ${selected.release_bank}` : ''}
                </p>
              </div>
            ) : null}
            {selected.actual_spent != null ? (
              <div>
                <p className="muted">Actual spent</p>
                <strong>{formatPhp(selected.actual_spent)}</strong>
                <p className="faint">Returned: {formatPhp(selected.returned_amount ?? 0)}</p>
              </div>
            ) : null}
          </div>

          {selected.notes ? (
            <p className="muted" style={{ marginTop: 12 }}>{selected.notes}</p>
          ) : null}
          {selected.rejection_reason ? (
            <div className="error-banner" style={{ marginTop: 12 }}>
              Rejected: {selected.rejection_reason}
            </div>
          ) : null}

          <h3 style={{ marginTop: 24 }}>Timeline</h3>
          {steps.length === 0 ? (
            <p className="muted">No steps yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>By</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.created_at)}</td>
                    <td>{s.action}</td>
                    <td>{s.actor?.full_name ?? '—'}</td>
                    <td>
                      {s.reason ?? s.release_reference ?? ''}
                      {s.release_method ? ` (${s.release_method === 'check' ? 'Check' : 'Online'})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {/* Actions per status */}
          {selected.status === 'draft' && selected.requester_id === user!.id ? (
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <Button onClick={() => onSubmit(selected.id)}>Submit for review</Button>
            </div>
          ) : null}

          {selected.status === 'submitted' && canReview ? (
            <div className="stack" style={{ marginTop: 16 }}>
              <Field label="Rejection reason (optional)" htmlFor="fr-reject">
                <TextInput id="fr-reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </Field>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => onForward(selected.id)}>Forward to Owner</Button>
                <Button variant="danger" onClick={() => onReject(selected.id)}>Reject</Button>
              </div>
            </div>
          ) : null}

          {selected.status === 'forwarded' && canApprove ? (
            <div className="stack" style={{ marginTop: 16 }}>
              <Field label="Rejection reason (optional)" htmlFor="fr-reject-owner">
                <TextInput id="fr-reject-owner" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </Field>
              <div className="row" style={{ gap: 8 }}>
                <Button onClick={() => onApprove(selected.id)}>Approve</Button>
                <Button variant="danger" onClick={() => onReject(selected.id)}>Reject</Button>
              </div>
            </div>
          ) : null}

          {selected.status === 'approved' && canRelease ? (
            <div className="stack" style={{ marginTop: 16 }}>
              <Field label="Release method" htmlFor="fr-method">
                <SelectInput
                  id="fr-method"
                  value={releaseMethod}
                  onChange={(e) => setReleaseMethod(e.target.value as ReleaseMethod)}
                >
                  <option value="online_transfer">Online transfer</option>
                  <option value="check">Check</option>
                </SelectInput>
              </Field>
              <Field label="Reference number" htmlFor="fr-ref">
                <TextInput id="fr-ref" required value={releaseRef} onChange={(e) => setReleaseRef(e.target.value)} />
              </Field>
              <Field label="Bank (optional)" htmlFor="fr-bank">
                <TextInput id="fr-bank" value={releaseBank} onChange={(e) => setReleaseBank(e.target.value)} />
              </Field>
              <Button onClick={() => onRelease(selected.id)}>Release funds</Button>
            </div>
          ) : null}

        </Card>
      ) : null}
    </div>
  )
}
