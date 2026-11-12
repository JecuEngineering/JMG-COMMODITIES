import { supabase } from '../../lib/supabase'
import { liquidateFundRequest, type FundRequest } from '../fund-requests/fundRequestsApi'

export type LiquidationStatus = 'draft' | 'submitted'

export interface LiquidationItem {
  id: string
  liquidation_id: string
  expense_date: string
  category: string
  description: string
  amount: number
}

export interface Liquidation {
  id: string
  fund_request_id: string
  branch_id: string
  requested_amount: number
  actual_spent: number
  returned_amount: number
  status: LiquidationStatus
  notes: string | null
  prepared_by: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
  fund_request?: FundRequest | null
  preparer?: { id: string; full_name: string } | null
  items?: LiquidationItem[]
}

const LIQUIDATION_SELECT =
  '*, fund_request:fund_requests(*, requester:profiles!fund_requests_requester_id_fkey(id, full_name), branch:branches(*)), preparer:profiles!liquidations_prepared_by_fkey(id, full_name), items:liquidation_items(*)'

export async function fetchLiquidations(): Promise<Liquidation[]> {
  const { data, error } = await supabase
    .from('liquidations')
    .select(LIQUIDATION_SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data as Liquidation[]) ?? []).map((row) => ({
    ...row,
    items: (row.items ?? []).slice().sort((a, b) => a.expense_date.localeCompare(b.expense_date)),
  }))
}

export async function createLiquidation(input: {
  fundRequestId: string
  branchId: string
  requestedAmount: number
  preparedBy: string
}): Promise<Liquidation> {
  const { data, error } = await supabase
    .from('liquidations')
    .insert({
      fund_request_id: input.fundRequestId,
      branch_id: input.branchId,
      requested_amount: input.requestedAmount,
      prepared_by: input.preparedBy,
      status: 'draft',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Liquidation
}

export async function addLiquidationItem(input: {
  liquidationId: string
  expenseDate: string
  category: string
  description: string
  amount: number
}): Promise<void> {
  const { error } = await supabase.from('liquidation_items').insert({
    liquidation_id: input.liquidationId,
    expense_date: input.expenseDate,
    category: input.category,
    description: input.description,
    amount: input.amount,
  })
  if (error) throw error
}

export async function deleteLiquidationItem(id: string): Promise<void> {
  const { error } = await supabase.from('liquidation_items').delete().eq('id', id)
  if (error) throw error
}

export async function saveLiquidationDraft(
  id: string,
  input: { notes?: string; actualSpent: number; returnedAmount: number },
): Promise<void> {
  const { error } = await supabase
    .from('liquidations')
    .update({
      notes: input.notes || null,
      actual_spent: input.actualSpent,
      returned_amount: input.returnedAmount,
    })
    .eq('id', id)
  if (error) throw error
}

export async function submitLiquidation(input: {
  liquidation: Liquidation
  actualSpent: number
  returnedAmount: number
  notes?: string
  submittedBy: string
}): Promise<void> {
  // Close the fund request first: repeating this call is harmless, whereas a
  // liquidation stuck on "submitted" could never be retried.
  await liquidateFundRequest({
    id: input.liquidation.fund_request_id,
    actualSpent: input.actualSpent,
    returnedAmount: input.returnedAmount,
    notes: input.notes,
    liquidatedBy: input.submittedBy,
  })

  const { error: updateError } = await supabase
    .from('liquidations')
    .update({
      status: 'submitted',
      actual_spent: input.actualSpent,
      returned_amount: input.returnedAmount,
      notes: input.notes || null,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', input.liquidation.id)
  if (updateError) throw updateError
}

export function liquidationItemTotal(items: LiquidationItem[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + Number(item.amount), 0)
}
