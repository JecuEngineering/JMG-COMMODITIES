export type ExportCell =
  | string
  | number
  | null
  | undefined
  | { text: string; href: string }

function cellText(value: ExportCell): string {
  if (value == null) return ''
  if (typeof value === 'object') return value.href
  return String(value)
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: ExportCell): string {
  const s = cellText(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, headers: string[], rows: ExportCell[][]) {
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) lines.push(row.map(escapeCsv).join(','))
  triggerDownload(filename, new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function excelCell(value: ExportCell): string {
  if (value != null && typeof value === 'object') {
    return `<td><a href="${escapeHtml(value.href)}">${escapeHtml(value.text)}</a></td>`
  }
  return `<td>${escapeHtml(value == null ? '' : String(value))}</td>`
}

/** SpreadsheetML/HTML table with an .xls extension — opens natively in Excel. */
export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: ExportCell[][],
) {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${row.map((cell) => excelCell(cell)).join('')}</tr>`)
    .join('')
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" />
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${escapeHtml(sheetName)}</x:Name>
<x:WorksheetOptions><x:DisplayGridlines /></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #999;padding:4px 6px;font-family:Arial,sans-serif;font-size:11pt}th{background:#eee;text-align:left}</style>
</head><body><table>${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${body}</tbody></table></body></html>`
  triggerDownload(
    filename,
    new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
  )
}

export function printPage() {
  window.print()
}
