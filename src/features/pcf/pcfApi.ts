import { supabase } from '../../lib/supabase'
import type { Branch, Profile } from '../../types/database'

/** Petty cash covers everyday small expenses; anything above this goes to Fund Requests. */
export const PCF_VOUCHER_LIMIT = 5000

/** Account classifications of the company's petty cash monitoring sheet. */
export const PCF_CLASSIFICATIONS = [
  'TRANSPORTATION/MEALS/TOLLS',
  'MEALS AND INTERTAINMENT',
  'EMPLOYEE BENEFITS',
  'COMMUNICATION',
  'SUPPLIES & JANITORIALS',
  'UTILITIES',
  'COURIER SERVICE',
  'REPAIR & MAINTENANCE',
  'TAXES & LICENSES',
  'CONTAINER CHARGES',
  'OTHER TOOLS &EQUIPMENTS',
  'Bank Charges',
  'GAS & OIL',
  'DISKARGA',
  'AR EMPLOYEE/ CASH OUT',
  'MEDICINES AND OTHERS',
] as const

/** Map free-text/legacy categories onto a monitoring-sheet column. */
export function pcfClassification(category: string | null): string {
  const value = (category ?? '').trim()
  const exact = PCF_CLASSIFICATIONS.find((c) => c.toLowerCase() === value.toLowerCase())
  if (exact) return exact
  const legacy: Record<string, (typeof PCF_CLASSIFICATIONS)[number]> = {
    supplies: 'SUPPLIES & JANITORIALS',
    transportation: 'TRANSPORTATION/MEALS/TOLLS',
    repairs: 'REPAIR & MAINTENANCE',
    utilities: 'UTILITIES',
    food: 'MEALS AND INTERTAINMENT',
    other: 'MEDICINES AND OTHERS',
  }
  return legacy[value.toLowerCase()] ?? 'MEDICINES AND OTHERS'
}

export interface PcfFund {
  id: string
  branch_id: string
  custodian_id: string | null
  fund_amount: number
  low_threshold: number
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  branch?: Branch | null
  custodian?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface PcfFundBalance extends PcfFund {
  branch_name: string
  vouchers_total: number
  replenishments_total: number
  balance: number
  is_low: boolean
}

export interface PcfVoucher {
  id: string
  fund_id: string
  period_id: string | null
  voucher_no: string | null
  voucher_date: string
  payee: string
  purpose: string | null
  category: string | null
  amount: number
  receipt_path: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  creator?: Pick<Profile, 'id' | 'full_name'> | null
  fund?: { branch_id: string } | null
}

export interface PcfReplenishment {
  id: string
  fund_id: string
  replenishment_date: string
  amount: number
  vouchers_covered: number | null
  reference_no: string | null
  released_by: string | null
  notes: string | null
  created_at: string
  releaser?: Pick<Profile, 'id' | 'full_name'> | null
}

/** One expenses "sheet" of a fund; open while expenses are being logged. */
export interface PcfPeriod {
  id: string
  fund_id: string
  branch_name: string
  label: string
  start_date: string
  end_date: string | null
  status: 'open' | 'closed'
  replenishment_id: string | null
  notes: string | null
  closed_by: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  voucher_count: number
  total: number
}

export async function fetchFundBalances(): Promise<PcfFundBalance[]> {
  const { data, error } = await supabase
    .from('v_pcf_fund_balances')
    .select('*')
    .order('branch_name')
  if (error) throw error
  const rows = (data as Record<string, unknown>[]) ?? []
  return rows.map((row) => ({
    id: String(row.id),
    branch_id: String(row.branch_id),
    branch_name: String(row.branch_name ?? ''),
    custodian_id: (row.custodian_id as string | null) ?? null,
    fund_amount: Number(row.fund_amount),
    low_threshold: Number(row.low_threshold),
    active: Boolean(row.active),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    deleted_at: (row.deleted_at as string | null) ?? null,
    branch: (row.branch as Branch | null) ?? null,
    custodian: (row.custodian as Pick<Profile, 'id' | 'full_name'> | null) ?? null,
    vouchers_total: Number(row.vouchers_total),
    replenishments_total: Number(row.replenishments_total),
    balance: Number(row.balance),
    is_low: Boolean(row.is_low),
  }))
}

export async function createFund(input: {
  branchId: string
  fundAmount: number
  lowThreshold?: number
  custodianId?: string | null
  notes?: string
}): Promise<PcfFund> {
  const { data, error } = await supabase
    .from('pcf_funds')
    .insert({
      branch_id: input.branchId,
      fund_amount: input.fundAmount,
      low_threshold: input.lowThreshold ?? 1000,
      custodian_id: input.custodianId || null,
      notes: input.notes || null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PcfFund
}

export async function fetchVouchers(fundId?: string): Promise<PcfVoucher[]> {
  let q = supabase
    .from('pcf_vouchers')
    .select('*, creator:profiles(id, full_name)')
    .is('deleted_at', null)
    .order('voucher_date', { ascending: false })
  if (fundId) q = q.eq('fund_id', fundId)
  const { data, error } = await q
  if (error) throw error
  return (data as PcfVoucher[]) ?? []
}

/** Short-lived signed URL for a receipt stored in the private pcf-receipts bucket. */
export async function pcfReceiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('pcf-receipts').createSignedUrl(path, 3600)
  if (error) throw error
  return data?.signedUrl ?? null
}

export async function createVoucher(input: {
  fundId: string
  voucherDate: string
  payee: string
  purpose?: string
  category?: string
  amount: number
  receiptPath?: string | null
  createdBy: string
}): Promise<PcfVoucher> {
  const { data, error } = await supabase
    .from('pcf_vouchers')
    .insert({
      fund_id: input.fundId,
      voucher_date: input.voucherDate,
      payee: input.payee,
      purpose: input.purpose || null,
      category: input.category || null,
      amount: input.amount,
      receipt_path: input.receiptPath || null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PcfVoucher
}

export async function fetchPeriods(fundId?: string): Promise<PcfPeriod[]> {
  let q = supabase
    .from('v_pcf_period_totals')
    .select('*')
    .order('start_date', { ascending: false })
  if (fundId) q = q.eq('fund_id', fundId)
  const { data, error } = await q
  if (error) throw error
  return ((data as PcfPeriod[]) ?? []).map((row) => ({
    ...row,
    voucher_count: Number(row.voucher_count),
    total: Number(row.total),
  }))
}

/** Cut the open sheet and start a new one. */
export async function closePeriod(periodId: string, label?: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('close_pcf_period', {
    p_period_id: periodId,
    p_label: label || null,
    p_notes: notes || null,
  })
  if (error) throw error
}

export async function fetchReplenishments(fundId?: string): Promise<PcfReplenishment[]> {
  let q = supabase
    .from('pcf_replenishments')
    .select('*, releaser:profiles(id, full_name)')
    .order('replenishment_date', { ascending: false })
  if (fundId) q = q.eq('fund_id', fundId)
  const { data, error } = await q
  if (error) throw error
  return (data as PcfReplenishment[]) ?? []
}

export async function createReplenishment(input: {
  fundId: string
  amount: number
  referenceNo?: string
  notes?: string
  releasedBy: string
}): Promise<PcfReplenishment> {
  const { data, error } = await supabase
    .from('pcf_replenishments')
    .insert({
      fund_id: input.fundId,
      amount: input.amount,
      reference_no: input.referenceNo || null,
      notes: input.notes || null,
      released_by: input.releasedBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PcfReplenishment
}

/** Vouchers that have not yet been covered by a replenishment
 *  (created after the latest replenishment date, or all if no replenishment). */
export async function fetchUnrecoveredVouchers(fundId: string): Promise<PcfVoucher[]> {
  const [vouchers, repl] = await Promise.all([
    fetchVouchers(fundId),
    fetchReplenishments(fundId),
  ])
  const lastReplDate = repl[0]?.replenishment_date
  if (!lastReplDate) return vouchers
  return vouchers.filter((v) => v.voucher_date > lastReplDate)
}
