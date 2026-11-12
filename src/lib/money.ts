/** Format PHP amounts. Values are stored as numeric(14,2), never floats for math. */
export function formatPhp(amount: number | string | null | undefined): string {
  const value = Number(amount ?? 0)
  if (Number.isNaN(value)) return '₱ 0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace('PHP', '₱')
}

/** Parse user input into a 2-decimal money number for display/forms. */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!cleaned) return null
  const value = Number(cleaned)
  if (Number.isNaN(value)) return null
  return Math.round(value * 100) / 100
}
