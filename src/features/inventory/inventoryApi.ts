import { supabase } from '../../lib/supabase'
import { cachedQuery } from '../../lib/queryCache'
import type {
  Branch,
  Sku,
  StockAdjustment,
  StockMovement,
  Transfer,
} from '../../types/database'

export interface StockBalanceRow {
  branch_id: string
  branch_name: string
  sku_id: string
  variety_name: string
  sack_size: number
  barcode: string | null
  on_hand: number
  reorder_level: number
  is_low: boolean
}

export function fetchBranches(): Promise<Branch[]> {
  return cachedQuery('ref:branches', async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .is('deleted_at', null)
      .eq('active', true)
      .order('name')
    if (error) throw error
    return (data as Branch[]) ?? []
  })
}

export function fetchSkus(): Promise<Sku[]> {
  return cachedQuery('ref:skus', async () => {
    const { data, error } = await supabase
      .from('skus')
      .select('*, variety:varieties(*)')
      .is('deleted_at', null)
      .eq('active', true)
      .order('sack_size')
    if (error) throw error
    return (data as Sku[]) ?? []
  })
}

export async function fetchStockBalances(branchId?: string | null): Promise<StockBalanceRow[]> {
  let balanceQuery = supabase.from('v_stock_on_hand').select('branch_id, sku_id, on_hand')
  if (branchId) balanceQuery = balanceQuery.eq('branch_id', branchId)

  const [skus, branches, balanceRes] = await Promise.all([fetchSkus(), fetchBranches(), balanceQuery])
  if (balanceRes.error) throw balanceRes.error

  const totals = new Map<string, number>()
  for (const row of (balanceRes.data ?? []) as { branch_id: string; sku_id: string; on_hand: number }[]) {
    totals.set(`${row.branch_id}:${row.sku_id}`, Number(row.on_hand))
  }

  const scopedBranches = branchId ? branches.filter((b) => b.id === branchId) : branches
  const rows: StockBalanceRow[] = []

  for (const branch of scopedBranches) {
    for (const sku of skus) {
      const onHand = totals.get(`${branch.id}:${sku.id}`) ?? 0
      if (onHand === 0 && !totals.has(`${branch.id}:${sku.id}`)) {
        // Still show zero rows so low-stock / empty branches are visible after seed
      }
      rows.push({
        branch_id: branch.id,
        branch_name: branch.name,
        sku_id: sku.id,
        variety_name: sku.variety?.name ?? '—',
        sack_size: sku.sack_size,
        barcode: sku.barcode,
        on_hand: onHand,
        reorder_level: sku.reorder_level ?? 100,
        is_low: onHand <= (sku.reorder_level ?? 100),
      })
    }
  }

  return rows.sort((a, b) => {
    if (a.is_low !== b.is_low) return a.is_low ? -1 : 1
    return a.variety_name.localeCompare(b.variety_name) || a.sack_size - b.sack_size
  })
}

export async function fetchStockCard(branchId: string, skuId: string): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, sku:skus(*, variety:varieties(*)), branch:branches(*)')
    .eq('branch_id', branchId)
    .eq('sku_id', skuId)
    .order('moved_at', { ascending: false })
  if (error) throw error
  return (data as StockMovement[]) ?? []
}

export async function postStockIn(params: {
  branchId: string
  skuId: string
  quantity: number
  note?: string
  movedAt?: string
}) {
  const { data, error } = await supabase.rpc('post_stock_in', {
    p_branch_id: params.branchId,
    p_sku_id: params.skuId,
    p_quantity: params.quantity,
    p_note: params.note ?? null,
    p_moved_at: params.movedAt ?? null,
  })
  if (error) throw error
  return data as string
}

export async function requestAdjustment(params: {
  branchId: string
  skuId: string
  quantity: number
  reason: string
}) {
  const { data, error } = await supabase.rpc('request_stock_adjustment', {
    p_branch_id: params.branchId,
    p_sku_id: params.skuId,
    p_quantity: params.quantity,
    p_reason: params.reason,
  })
  if (error) throw error
  return data as string
}

export async function reviewAdjustment(adjustmentId: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('review_stock_adjustment', {
    p_adjustment_id: adjustmentId,
    p_approve: approve,
    p_review_note: note ?? null,
  })
  if (error) throw error
}

export async function fetchAdjustments(branchId?: string | null): Promise<StockAdjustment[]> {
  let query = supabase
    .from('stock_adjustments')
    .select('*, sku:skus(*, variety:varieties(*)), branch:branches(*)')
    .order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  const { data, error } = await query
  if (error) throw error
  return (data as StockAdjustment[]) ?? []
}

export async function postRepacking(params: {
  branchId: string
  repackDate: string
  inputWeightKg: number
  outputWeightKg: number
  reason?: string
  lines: { sku_id: string; direction: 'in' | 'out'; sacks: number }[]
}) {
  const { data, error } = await supabase.rpc('post_repacking', {
    p_branch_id: params.branchId,
    p_repack_date: params.repackDate,
    p_input_weight_kg: params.inputWeightKg,
    p_output_weight_kg: params.outputWeightKg,
    p_reason: params.reason ?? null,
    p_lines: params.lines,
  })
  if (error) throw error
  return data as string
}

export async function createTransfer(params: {
  fromBranchId: string
  toBranchId: string
  notes?: string
  lines: { sku_id: string; sacks_sent: number }[]
}) {
  const { data, error } = await supabase.rpc('create_transfer', {
    p_from_branch_id: params.fromBranchId,
    p_to_branch_id: params.toBranchId,
    p_notes: params.notes ?? null,
    p_lines: params.lines,
  })
  if (error) throw error
  return data as string
}

export async function shipTransfer(transferId: string) {
  const { error } = await supabase.rpc('ship_transfer', { p_transfer_id: transferId })
  if (error) throw error
}

export async function receiveTransfer(
  transferId: string,
  lines: { sku_id: string; sacks_received: number }[],
) {
  const { error } = await supabase.rpc('receive_transfer', {
    p_transfer_id: transferId,
    p_received_lines: lines,
  })
  if (error) throw error
}

export async function fetchTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select(
      '*, from_branch:branches!from_branch_id(*), to_branch:branches!to_branch_id(*), lines:transfer_lines(*, sku:skus(*, variety:varieties(*)))',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Transfer[]) ?? []
}

export function skuLabel(sku: Sku): string {
  return `${sku.variety?.name ?? 'Variety'} · ${sku.sack_size}kg`
}
