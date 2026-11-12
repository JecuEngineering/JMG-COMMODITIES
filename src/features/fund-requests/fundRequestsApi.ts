import { supabase } from '../../lib/supabase'
import type { Branch, Profile } from '../../types/database'

export type FundRequestStatus =
  | 'draft'
  | 'submitted'
  | 'forwarded'
  | 'approved'
  | 'released'
  | 'liquidated'
  | 'rejected'

export type ReleaseMethod = 'online_transfer' | 'check'

export type FundRequestType = 'cash_advance' | 'reimbursement' | 'purchase' | 'other'

export interface FundRequest {
  id: string
  requester_id: string
  branch_id: string
  purpose: string
  category: string | null
  request_type: FundRequestType
  amount: number
  status: FundRequestStatus
  attachments: string[] | null
  notes: string | null
  release_method: ReleaseMethod | null
  release_reference: string | null
  release_bank: string | null
  released_by: string | null
  released_at: string | null
  actual_spent: number | null
  returned_amount: number | null
  liquidation_notes: string | null
  liquidated_by: string | null
  liquidated_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  requester?: Pick<Profile, 'id' | 'full_name'> | null
  branch?: Branch | null
  releaser?: Pick<Profile, 'id' | 'full_name'> | null
  liquidator?: Pick<Profile, 'id' | 'full_name'> | null
  rejector?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface FundRequestStep {
  id: string
  fund_request_id: string
  action: string
  actor_id: string
  reason: string | null
  release_method: ReleaseMethod | null
  release_reference: string | null
  release_bank: string | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface LiquidationReceipt {
  id: string
  fund_request_id: string
  description: string
  amount: number
  receipt_path: string | null
  created_at: string
}

export async function fetchFundRequests(): Promise<FundRequest[]> {
  const { data, error } = await supabase
    .from('fund_requests')
    .select(
      '*, requester:profiles!fund_requests_requester_id_fkey(id, full_name), branch:branches(*), releaser:profiles!fund_requests_released_by_fkey(id, full_name), liquidator:profiles!fund_requests_liquidated_by_fkey(id, full_name), rejector:profiles!fund_requests_rejected_by_fkey(id, full_name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as FundRequest[]) ?? []
}

export async function fetchFundRequest(id: string): Promise<FundRequest | null> {
  const { data, error } = await supabase
    .from('fund_requests')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as FundRequest
}

export async function fetchSteps(fundRequestId: string): Promise<FundRequestStep[]> {
  const { data, error } = await supabase
    .from('fund_request_steps')
    .select('*, actor:profiles(id, full_name)')
    .eq('fund_request_id', fundRequestId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as FundRequestStep[]) ?? []
}

export async function fetchReceipts(fundRequestId: string): Promise<LiquidationReceipt[]> {
  const { data, error } = await supabase
    .from('liquidation_receipts')
    .select('*')
    .eq('fund_request_id', fundRequestId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as LiquidationReceipt[]) ?? []
}

export async function createFundRequest(input: {
  requesterId: string
  branchId: string
  purpose: string
  category?: string
  requestType?: FundRequestType
  amount: number
  notes?: string
}): Promise<FundRequest> {
  const { data, error } = await supabase
    .from('fund_requests')
    .insert({
      requester_id: input.requesterId,
      branch_id: input.branchId,
      purpose: input.purpose,
      category: input.category || null,
      request_type: input.requestType ?? 'cash_advance',
      amount: input.amount,
      notes: input.notes || null,
      status: 'draft',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as FundRequest
}

export async function submitFundRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({ status: 'submitted' })
    .eq('id', id)
  if (error) throw error
}

export async function forwardFundRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({ status: 'forwarded' })
    .eq('id', id)
  if (error) throw error
}

export async function rejectFundRequest(id: string, reason: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejected_by: actorId,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function approveFundRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({ status: 'approved' })
    .eq('id', id)
  if (error) throw error
}

export async function releaseFundRequest(input: {
  id: string
  method: ReleaseMethod
  reference: string
  bank?: string
  releasedBy: string
}): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({
      status: 'released',
      release_method: input.method,
      release_reference: input.reference,
      release_bank: input.bank || null,
      released_by: input.releasedBy,
      released_at: new Date().toISOString(),
    })
    .eq('id', input.id)
  if (error) throw error
}

export async function liquidateFundRequest(input: {
  id: string
  actualSpent: number
  returnedAmount: number
  notes?: string
  liquidatedBy: string
}): Promise<void> {
  const { error } = await supabase
    .from('fund_requests')
    .update({
      status: 'liquidated',
      actual_spent: input.actualSpent,
      returned_amount: input.returnedAmount,
      liquidation_notes: input.notes || null,
      liquidated_by: input.liquidatedBy,
      liquidated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
  if (error) throw error
}

export async function addLiquidationReceipt(input: {
  fundRequestId: string
  description: string
  amount: number
  receiptPath?: string | null
}): Promise<LiquidationReceipt> {
  const { data, error } = await supabase
    .from('liquidation_receipts')
    .insert({
      fund_request_id: input.fundRequestId,
      description: input.description,
      amount: input.amount,
      receipt_path: input.receiptPath || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LiquidationReceipt
}
