import { supabase } from '../../lib/supabase'
import type { Branch, Sku } from '../../types/database'

export type ContainerStatus = 'in_transit' | 'arrived' | 'unloading' | 'received' | 'closed'
export type ContainerCostType = 'purchase' | 'freight' | 'duties' | 'handling' | 'trucking' | 'other'
export type PurchaseStatus = 'draft' | 'ordered' | 'partial' | 'paid' | 'cancelled'

export interface Supplier {
  id: string
  name: string
  contact: string | null
  notes: string | null
  active: boolean
}

export interface Purchase {
  id: string
  supplier_id: string
  purchase_date: string
  total: number
  paid_amount: number
  status: PurchaseStatus
  notes: string | null
  supplier?: Supplier | null
}

export interface ContainerLine {
  id: string
  container_id: string
  sku_id: string
  branch_id: string
  expected_sacks: number
  actual_sacks: number | null
  cost_per_sack: number | null
  difference_reason: string | null
  sku?: Sku | null
  branch?: Branch | null
}

export interface ContainerCost {
  id: string
  container_id: string
  cost_type: ContainerCostType
  amount: number
  reference_no: string | null
  notes: string | null
}

export interface Container {
  id: string
  supplier_id: string
  purchase_id: string | null
  container_number: string | null
  supplier_ref: string
  origin: string | null
  expected_arrival: string | null
  arrival_date: string | null
  status: ContainerStatus
  primary_branch_id: string | null
  notes: string | null
  unloading_notes: string | null
  received_at: string | null
  created_at: string
  supplier?: Supplier | null
  primary_branch?: Branch | null
  lines?: ContainerLine[]
  costs?: ContainerCost[]
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return (data as Supplier[]) ?? []
}

export async function createSupplier(input: {
  name: string
  contact?: string
  notes?: string
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: input.name,
      contact: input.contact || null,
      notes: input.notes || null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Supplier
}

export async function fetchPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('*, supplier:suppliers(*)')
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
  if (error) throw error
  return (data as Purchase[]) ?? []
}

export async function createPurchase(input: {
  supplier_id: string
  purchase_date: string
  total: number
  notes?: string
}): Promise<Purchase> {
  const { data, error } = await supabase
    .from('purchases')
    .insert({
      supplier_id: input.supplier_id,
      purchase_date: input.purchase_date,
      total: input.total,
      paid_amount: 0,
      status: 'ordered',
      notes: input.notes || null,
    })
    .select('*, supplier:suppliers(*)')
    .single()
  if (error) throw error
  return data as Purchase
}

export async function recordPurchasePayment(purchase: Purchase, amount: number): Promise<void> {
  const balance = Number(purchase.total) - Number(purchase.paid_amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a payment amount greater than zero.')
  if (amount > balance) throw new Error(`Payment exceeds the remaining balance of ${balance.toFixed(2)}.`)
  const paid = Number(purchase.paid_amount) + amount
  const status: PurchaseStatus = paid >= Number(purchase.total) ? 'paid' : 'partial'
  const { error } = await supabase
    .from('purchases')
    .update({ paid_amount: paid, status })
    .eq('id', purchase.id)
  if (error) throw error
}

export async function fetchContainers(): Promise<Container[]> {
  const { data, error } = await supabase
    .from('containers')
    .select(
      `*,
      supplier:suppliers(*),
      primary_branch:branches!primary_branch_id(*),
      lines:container_lines(*, sku:skus(*, variety:varieties(*)), branch:branches(*)),
      costs:container_costs(*)`,
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Container[]) ?? []
}

export async function createContainer(input: {
  supplier_id: string
  purchase_id?: string | null
  container_number?: string
  supplier_ref: string
  origin?: string
  expected_arrival?: string
  primary_branch_id: string
  notes?: string
  lines: { sku_id: string; branch_id: string; expected_sacks: number }[]
}): Promise<string> {
  const { data: container, error } = await supabase
    .from('containers')
    .insert({
      supplier_id: input.supplier_id,
      purchase_id: input.purchase_id || null,
      container_number: input.container_number?.trim() || null,
      supplier_ref: input.supplier_ref,
      origin: input.origin || null,
      expected_arrival: input.expected_arrival || null,
      primary_branch_id: input.primary_branch_id,
      notes: input.notes || null,
      status: 'in_transit',
    })
    .select('id')
    .single()
  if (error) throw error

  const { error: linesError } = await supabase.from('container_lines').insert(
    input.lines.map((line) => ({
      container_id: container.id,
      sku_id: line.sku_id,
      branch_id: line.branch_id,
      expected_sacks: line.expected_sacks,
    })),
  )
  if (linesError) throw linesError
  return container.id as string
}

export async function updateContainer(input: {
  id: string
  supplier_id: string
  purchase_id?: string | null
  container_number?: string
  supplier_ref: string
  origin?: string
  expected_arrival?: string
  primary_branch_id: string
  notes?: string
}) {
  const { error } = await supabase
    .from('containers')
    .update({
      supplier_id: input.supplier_id,
      purchase_id: input.purchase_id || null,
      container_number: input.container_number?.trim() || null,
      supplier_ref: input.supplier_ref,
      origin: input.origin || null,
      expected_arrival: input.expected_arrival || null,
      primary_branch_id: input.primary_branch_id,
      notes: input.notes || null,
    })
    .eq('id', input.id)
  if (error) throw error
}

export async function updateContainerStatus(id: string, status: ContainerStatus) {
  const payload: Record<string, unknown> = { status }
  if (status === 'arrived') payload.arrival_date = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('containers').update(payload).eq('id', id)
  if (error) throw error
}

export async function addContainerCost(input: {
  container_id: string
  cost_type: ContainerCostType
  amount: number
  reference_no?: string
  notes?: string
}) {
  const { error } = await supabase.from('container_costs').insert({
    container_id: input.container_id,
    cost_type: input.cost_type,
    amount: input.amount,
    reference_no: input.reference_no || null,
    notes: input.notes || null,
  })
  if (error) throw error
}

export async function receiveContainer(
  containerId: string,
  lines: { line_id: string; actual_sacks: number; difference_reason?: string }[],
  unloadingNotes?: string,
) {
  const { error } = await supabase.rpc('receive_container', {
    p_container_id: containerId,
    p_lines: lines,
    p_unloading_notes: unloadingNotes ?? null,
  })
  if (error) throw error
}

export async function closeContainer(containerId: string) {
  const { error } = await supabase.rpc('close_container', { p_container_id: containerId })
  if (error) throw error
}

export function containerLandedTotal(costs: ContainerCost[] | undefined): number {
  return (costs ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
}
