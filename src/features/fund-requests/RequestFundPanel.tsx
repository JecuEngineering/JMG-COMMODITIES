import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { DateInput } from '../../components/DateInput'
import { Field, SelectInput, TextInput } from '../../components/Field'
import { useAuth } from '../auth/AuthContext'
import { useCompanySettings } from '../settings/useCompanySettings'
import { formatDate, todayInputValue } from '../../lib/dates'
import { downloadExcel, printPage } from '../../lib/export'
import { formatPhp } from '../../lib/money'
import { ROLE_LABELS, canCreateFundRequest } from '../../lib/roles'
import {
  fetchReplenishments,
  fetchVouchers,
  pcfReceiptUrl,
  type PcfFundBalance,
  type PcfReplenishment,
  type PcfVoucher,
} from '../pcf/pcfApi'
import '../pcf/pcf.css'
import { createFundRequest } from './fundRequestsApi'

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function longDate(date: string) {
  if (!date) return '—'
  const d = new Date(`${date}T00:00:00`)
  return d
    .toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
}

interface RequestLine {
  id: string
  description: string
  amount: string
}

let lineSeq = 0
function newLine(): RequestLine {
  lineSeq += 1
  return { id: `rfh-line-${lineSeq}`, description: '', amount: '' }
}

export function RequestFundPanel({
  funds,
  onCreated,
}: {
  funds: PcfFundBalance[]
  onCreated?: () => void | Promise<void>
}) {
  const { user } = useAuth()
  const { settings } = useCompanySettings()
  const role = user!.profile.role
  const branchId = user!.profile.branch_id
  const canCreate = canCreateFundRequest(role) && Boolean(branchId)

  const visibleFunds = useMemo(
    () => (branchId ? funds.filter((f) => f.branch_id === branchId) : funds),
    [funds, branchId],
  )

  const [fundId, setFundId] = useState('')
  const [vouchers, setVouchers] = useState<PcfVoucher[]>([])
  const [replenishments, setReplenishments] = useState<PcfReplenishment[]>([])
  const [requestNo, setRequestNo] = useState<string | null>(null)
  const [purpose, setPurpose] = useState('PETTY CASH REPLENISHMENT')
  const [from, setFrom] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [funding, setFunding] = useState<string | null>(null)
  const [approvedBy, setApprovedBy] = useState('')
  const [president, setPresident] = useState('')
  const [releasedDate, setReleasedDate] = useState(todayInputValue())
  const [thru, setThru] = useState('')
  const [lines, setLines] = useState<RequestLine[]>(() => [newLine()])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFundId((prev) => (visibleFunds.some((f) => f.id === prev) ? prev : visibleFunds[0]?.id ?? ''))
  }, [visibleFunds])

  const fund = visibleFunds.find((f) => f.id === fundId) ?? null

  const loadFund = useCallback(async (id: string) => {
    if (!id) {
      setVouchers([])
      setReplenishments([])
      return
    }
    try {
      const [v, r] = await Promise.all([fetchVouchers(id), fetchReplenishments(id)])
      setVouchers(v)
      setReplenishments(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void loadFund(fundId)
  }, [fundId, loadFund])

  const fromValue =
    from ?? (replenishments[0] ? addDays(replenishments[0].replenishment_date, 1) : monthStart())
  const toValue = to ?? todayInputValue()
  const fundingValue = funding == null ? Number(fund?.fund_amount ?? 0) : Number(funding) || 0
  const requestNoValue =
    requestNo ??
    `RFH-${(fund?.branch_name ?? 'PCF').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}-${todayInputValue().replace(/-/g, '')}`

  const periodVouchers = useMemo(
    () =>
      vouchers
        .filter((v) => v.voucher_date >= fromValue && v.voucher_date <= toValue)
        .slice()
        .sort((a, b) => a.voucher_date.localeCompare(b.voucher_date)),
    [vouchers, fromValue, toValue],
  )

  const categoryRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of periodVouchers) {
      const key = v.category || 'Other'
      map.set(key, (map.get(key) ?? 0) + Number(v.amount))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [periodVouchers])

  const filledLines = useMemo(
    () => lines.filter((l) => l.description.trim() !== '' || (Number(l.amount) || 0) > 0),
    [lines],
  )

  const vouchersTotal = periodVouchers.reduce((sum, v) => sum + Number(v.amount), 0)
  const linesTotal = filledLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const requestTotal = vouchersTotal + linesTotal

  const branchLabel = fund?.branch_name ?? 'PCF'
  const companyName = settings?.name ?? 'JMG Commodities Inc.'
  const logoSrc = settings?.logo_url ?? '/JMG COMMODITIES.jpeg'

  async function openReceipt(path: string) {
    try {
      const url = await pcfReceiptUrl(path)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function exportExcel() {
    downloadExcel(
      `request-for-fund-${requestNoValue}.xls`,
      'Request for Fund',
      ['Unit / Item', 'Description', 'Amount'],
      [
        [branchLabel, 'PETTY CASH REPLENISHMENT', ''],
        ['', `EXPENSE INCURRED ${longDate(fromValue)} - ${longDate(toValue)}`, ''],
        ...categoryRows.map(([name, amount]) => ['', name, Number(amount).toFixed(2)]),
        ...filledLines.map((l) => ['', l.description.trim(), (Number(l.amount) || 0).toFixed(2)]),
        ['', 'TOTAL EXPENSE', requestTotal.toFixed(2)],
        ['', 'PCF FUNDING', fundingValue.toFixed(2)],
        ['', 'BALANCE', (fundingValue - requestTotal).toFixed(2)],
        ['', 'FOR REQUEST', requestTotal.toFixed(2)],
        ['', 'Requested by', `${user!.profile.full_name} (${ROLE_LABELS[role]})`],
        ['', 'Approved by', approvedBy],
        ['', 'President', president],
      ],
    )
  }

  async function onCreateDraft() {
    setError(null)
    setMessage(null)
    if (!fund) {
      setError('No petty cash fund is set up for your branch.')
      return
    }
    if (!purpose.trim()) {
      setError('Enter the purpose of the request.')
      return
    }
    if (!Number.isFinite(requestTotal) || requestTotal <= 0) {
      setError('There is nothing to request for this period.')
      return
    }
    setSaving(true)
    try {
      await createFundRequest({
        requesterId: user!.id,
        branchId: fund.branch_id,
        purpose: purpose.trim(),
        category: 'Other',
        requestType: 'cash_advance',
        amount: requestTotal,
        notes: `${requestNoValue} · PCF vouchers ${fromValue} to ${toValue} · Vouchers ${formatPhp(vouchersTotal)} + additional lines ${formatPhp(linesTotal)}`,
      })
      setMessage(
        `Draft fund request created for ${formatPhp(requestTotal)}. Open My requests to submit it for review.`,
      )
      setLines([newLine()])
      await onCreated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (visibleFunds.length === 0) {
    return (
      <Card title="Request for fund">
        <div className="empty-state">
          No petty cash fund is set up for your branch yet. Ask the Owner to set one up in Petty
          Cash.
        </div>
      </Card>
    )
  }

  return (
    <div className="stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <Card title="Request details" className="no-print">
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          {visibleFunds.length > 1 ? (
            <Field label="Branch fund" htmlFor="rfh-fund">
              <SelectInput id="rfh-fund" value={fundId} onChange={(e) => setFundId(e.target.value)}>
                {visibleFunds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.branch_name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : null}
          <Field label="RFH #" htmlFor="rfh-no">
            <TextInput id="rfh-no" value={requestNoValue} onChange={(e) => setRequestNo(e.target.value)} />
          </Field>
          <Field label="Purpose" htmlFor="rfh-purpose">
            <TextInput id="rfh-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </Field>
          <Field label="Expenses from" htmlFor="rfh-from">
            <DateInput id="rfh-from" value={fromValue} onChange={setFrom} />
          </Field>
          <Field label="Expenses to" htmlFor="rfh-to">
            <DateInput id="rfh-to" value={toValue} onChange={setTo} />
          </Field>
          <Field label="PCF funding (₱)" htmlFor="rfh-funding">
            <TextInput
              id="rfh-funding"
              inputMode="decimal"
              value={funding ?? String(fund?.fund_amount ?? '')}
              onChange={(e) => setFunding(e.target.value)}
            />
          </Field>
          <Field label="Approved by" htmlFor="rfh-approved">
            <TextInput
              id="rfh-approved"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              placeholder="Name"
            />
          </Field>
          <Field label="President" htmlFor="rfh-president">
            <TextInput
              id="rfh-president"
              value={president}
              onChange={(e) => setPresident(e.target.value)}
              placeholder="Name"
            />
          </Field>
          <Field label="Released date" htmlFor="rfh-released">
            <DateInput id="rfh-released" value={releasedDate} onChange={setReleasedDate} />
          </Field>
          <Field label="Thru" htmlFor="rfh-thru">
            <TextInput
              id="rfh-thru"
              value={thru}
              onChange={(e) => setThru(e.target.value)}
              placeholder="Released thru"
            />
          </Field>
        </div>

        <div className="stack" style={{ gap: 8, marginTop: 16 }}>
          <span className="field-label" style={{ marginBottom: 0 }}>
            Additional lines — typed straight into the form
          </span>
          {lines.map((line) => (
            <div key={line.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <TextInput
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.id === line.id ? { ...l, description: e.target.value } : l)),
                    )
                  }
                  placeholder="Description"
                  aria-label="Description"
                />
              </div>
              <div style={{ width: 170 }}>
                <TextInput
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.id === line.id ? { ...l, amount: e.target.value } : l)),
                    )
                  }
                  placeholder="Amount (₱)"
                  aria-label="Amount"
                />
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  setLines((prev) =>
                    prev.length === 1 ? [newLine()] : prev.filter((l) => l.id !== line.id),
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button variant="secondary" onClick={() => setLines((prev) => [...prev, newLine()])}>
              + Add line
            </Button>
          </div>
        </div>

        <p className="faint" style={{ marginTop: 10 }}>
          {periodVouchers.length} voucher(s) in range
          {filledLines.length > 0 ? ` + ${filledLines.length} typed line(s)` : ''} · Total{' '}
          {formatPhp(requestTotal)} · Balance {formatPhp(fundingValue - requestTotal)}
        </p>

        {periodVouchers.length > 0 ? (
          <details style={{ marginTop: 12 }}>
            <summary className="muted">Show voucher receipts in this period</summary>
            <ul className="stack" style={{ gap: 6, marginTop: 8, paddingLeft: 18 }}>
              {periodVouchers.map((v) => (
                <li key={v.id}>
                  {formatDate(v.voucher_date)} · {v.payee} · {formatPhp(v.amount)}{' '}
                  {v.receipt_path ? (
                    <Button variant="ghost" onClick={() => void openReceipt(v.receipt_path!)}>
                      View receipt
                    </Button>
                  ) : (
                    <span className="faint">no receipt</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          {canCreate ? (
            <Button onClick={() => void onCreateDraft()} loading={saving}>
              Create fund request
            </Button>
          ) : null}
          <Button variant="secondary" onClick={exportExcel}>
            Export Excel
          </Button>
          <Button variant="ghost" onClick={printPage}>
            Print / PDF
          </Button>
        </div>
        <p className="faint" style={{ marginTop: 8 }}>
          A4 portrait. The browser print dialog lists every installed printer — choose the EPSON
          L1320 there; a website cannot pre-select or hide printers.
        </p>
      </Card>

      <div className="pcf-sheet">
        <header className="pcf-sheet-head">
          <img src={logoSrc} alt="" className="pcf-sheet-logo" />
          <div className="pcf-sheet-company">
            <strong>{companyName}</strong>
            {settings?.address ? <span>{settings.address}</span> : null}
            {settings?.contacts ? <span>{settings.contacts}</span> : null}
          </div>
        </header>

        <h2 className="pcf-sheet-title">REQUEST FOR FUND</h2>

        <div className="pcf-sheet-meta">
          <div>
            <strong>RFH#:</strong> {requestNoValue}
          </div>
          <div>
            <strong>DATE:</strong> {longDate(toValue)}
          </div>
        </div>
        <div className="pcf-sheet-purpose">
          <strong>DESCRIPTION/ PURPOSE:</strong> <span>{purpose}</span>
        </div>

        <table className="pcf-form-table">
          <thead>
            <tr>
              <th style={{ width: '20%' }}>UNIT/ ITEM</th>
              <th>DESCRIPTION</th>
              <th style={{ width: '24%' }}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowSpan={categoryRows.length + filledLines.length + 1} className="pcf-unit">
                {branchLabel}
                <br />
                PETTY CASH
                <br />
                REPLENISHMENT
              </td>
              <td className="pcf-period">
                EXPENSE INCURRED {longDate(fromValue)} - {longDate(toValue)}
              </td>
              <td />
            </tr>
            {categoryRows.map(([name, amount]) => (
              <tr key={name}>
                <td>{name.toUpperCase()}</td>
                <td className="pcf-num">{formatPhp(amount)}</td>
              </tr>
            ))}
            {filledLines.map((line) => (
              <tr key={line.id}>
                <td>{line.description.trim().toUpperCase()}</td>
                <td className="pcf-num">{formatPhp(Number(line.amount) || 0)}</td>
              </tr>
            ))}
            {categoryRows.length === 0 && filledLines.length === 0 ? (
              <tr>
                <td className="muted">No expenses in this period.</td>
                <td className="pcf-num">{formatPhp(0)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="pcf-right pcf-strong">TOTAL EXPENSE</td>
              <td className="pcf-num pcf-strong">{formatPhp(requestTotal)}</td>
            </tr>
            <tr>
              <td className="pcf-right">PCF FUNDING</td>
              <td className="pcf-num">{formatPhp(fundingValue)}</td>
            </tr>
            <tr>
              <td className="pcf-right pcf-strong pcf-red">BALANCE</td>
              <td className="pcf-num pcf-strong pcf-red">{formatPhp(fundingValue - requestTotal)}</td>
            </tr>
            <tr className="pcf-for-request">
              <td />
              <td className="pcf-right pcf-strong">FOR REQUEST</td>
              <td className="pcf-num pcf-strong pcf-red">{formatPhp(requestTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div className="pcf-signatures">
          <div>
            <span>REQUESTED BY:</span>
            <strong>{user!.profile.full_name}</strong>
            <em>{ROLE_LABELS[role].toUpperCase()}</em>
          </div>
          <div>
            <span>APPROVED BY :</span>
            <strong>{approvedBy || '\u00A0'}</strong>
            <em>FINANCE MANAGER</em>
          </div>
          <div>
            <span>{'\u00A0'}</span>
            <strong>{president || '\u00A0'}</strong>
            <em>PRESIDENT</em>
          </div>
          <div>
            <span>RELEASED DATE:</span>
            <strong>{releasedDate ? longDate(releasedDate) : '\u00A0'}</strong>
          </div>
          <div>
            <span>THRU:</span>
            <strong>{thru || '\u00A0'}</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
