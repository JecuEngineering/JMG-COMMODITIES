import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import './ui.css'

interface RowDetail {
  title: string
  fields: { label: string; value: string }[]
}

const NAME_LABEL = /\b(name|payee|description)\b/i
const REF_LABEL = /\b(pcv|invoice|dr|or|ref)\b/i

/** "ALDERI · AC-1991" — the values that identify the record. */
function rowTitle(fields: { label: string; value: string }[]) {
  const name = fields.find((field) => NAME_LABEL.test(field.label))
  const ref = fields.find((field) => REF_LABEL.test(field.label))
  const title = [name, ref]
    .filter((field): field is { label: string; value: string } => Boolean(field))
    .map((field) => field.value)
    .filter((value, i, list) => list.indexOf(value) === i)
    .join(' · ')
  if (!title) return fields[0].value.length > 48 ? 'Row details' : fields[0].value
  return title.length > 56 ? 'Row details' : title
}

function trimmedText(el: Element | null | undefined) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function Table({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<RowDetail | null>(null)
  const [isPhone, setIsPhone] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 719px)')
    const update = () => setIsPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  function openRow(event: MouseEvent<HTMLDivElement>) {
    if (!isPhone) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, select, textarea, label')) return
    const row = target.closest('tr')
    if (!row || !row.closest('tbody')) return

    const table = row.closest('table')
    const headers = Array.from(table?.querySelectorAll('thead th') ?? []).map((th) => trimmedText(th))
    const fields: { label: string; value: string }[] = []
    let index = 0
    for (const cell of Array.from(row.querySelectorAll<HTMLTableCellElement>(':scope > td'))) {
      const label = headers[index] ?? ''
      const value = trimmedText(cell)
      if (label && value) fields.push({ label, value })
      index += cell.colSpan || 1
    }
    if (fields.length === 0) return

    setDetail({ title: rowTitle(fields), fields })
  }

  return (
    <>
      <div className="ui-table-wrap" onClick={openRow}>
        <table className="ui-table">{children}</table>
      </div>
      {detail ? (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={detail.title}
          subtitle="Row details"
          size="md"
          footer={<Button onClick={() => setDetail(null)}>Close</Button>}
        >
          <dl className="ui-row-detail">
            {detail.fields.map((field, i) => (
              <div className="ui-row-detail-item" key={`${field.label}-${i}`}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      ) : null}
    </>
  )
}
