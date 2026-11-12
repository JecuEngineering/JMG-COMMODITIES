import { supabase } from '../../lib/supabase'
import type { Branch, Sku } from '../../types/database'

export type PaymentMethod = 'cash' | 'gcash' | 'bank' | 'check' | 'installment'

export interface Customer {
  id: string
  branch_id: string | null
  name: string
  contact: string | null
  address: string | null
  notes: string | null
  active: boolean
}

export interface Sale {
  id: string
  branch_id: string
  customer_id: string | null
  cashier_id: string | null
  sale_date: string
  status: string
  payment_type: PaymentMethod
  subtotal: number
  discount: number
  total: number
  amount_paid: number
  balance: number
  dr_number: string | null
  or_number: string | null
  notes: string | null
  created_at: string
  customer?: Customer | null
  branch?: Branch | null
  items?: SaleItem[]
  payments?: PaymentRow[]
}

export interface SaleItem {
  id: string
  sale_id: string
  sku_id: string
  sacks: number
  price_per_sack: number
  discount: number
  line_total: number
  sku?: Sku | null
}

export interface PaymentRow {
  id: string
  sale_id: string
  payment_date: string
  amount: number
  method: PaymentMethod
  reference_no: string | null
}

export interface InstallmentDue {
  id: string
  plan_id: string
  due_date: string
  amount: number
  paid_amount: number
  sequence_no: number
  plan?: { sale_id: string; sale?: Sale | null } | null
}

export interface CashierShift {
  id: string
  cashier_id: string
  branch_id: string
  status: 'open' | 'closed'
  opened_at: string
  opening_cash: number
  closed_at: string | null
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
}

export async function fetchCustomers(branchId?: string | null): Promise<Customer[]> {
  let q = supabase.from('customers').select('*').is('deleted_at', null).eq('active', true).order('name')
  if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)
  const { data, error } = await q
  if (error) throw error
  return (data as Customer[]) ?? []
}

export async function createCustomer(input: {
  name: string
  branch_id?: string | null
  contact?: string
  address?: string
}): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: input.name,
      branch_id: input.branch_id || null,
      contact: input.contact || null,
      address: input.address || null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Customer
}

export async function fetchAvailableStock(branchId: string, skuId: string): Promise<number> {
  const { data, error } = await supabase
    .from('v_stock_on_hand')
    .select('on_hand')
    .eq('branch_id', branchId)
    .eq('sku_id', skuId)
    .maybeSingle()
  if (error) throw error
  return data ? Number(data.on_hand) : 0
}

export async function fetchCurrentPrice(skuId: string): Promise<number | null> {  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('prices')
    .select('price, effective_from')
    .eq('sku_id', skuId)
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? Number(data.price) : null
}

export async function createSale(input: {
  branchId: string
  customerId: string
  paymentType: PaymentMethod
  items: { sku_id: string; sacks: number; price_per_sack: number; discount?: number }[]
  orNumber?: string
  notes?: string
  downPayment?: number
  installmentParts?: number
  firstDueDate?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_sale', {
    p_branch_id: input.branchId,
    p_customer_id: input.customerId,
    p_payment_type: input.paymentType,
    p_items: input.items,
    p_or_number: input.orNumber || null,
    p_notes: input.notes || null,
    p_down_payment: input.downPayment ?? 0,
    p_installment_parts: input.installmentParts ?? 1,
    p_first_due_date: input.firstDueDate || null,
  })
  if (error) throw error
  return data as string
}

export async function fetchSales(branchId?: string | null): Promise<Sale[]> {
  let q = supabase
    .from('sales')
    .select('*, customer:customers(*), branch:branches(*), items:sale_items(*, sku:skus(*, variety:varieties(*))), payments(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (branchId) q = q.eq('branch_id', branchId)
  const { data, error } = await q
  if (error) throw error
  return (data as Sale[]) ?? []
}

export async function fetchSale(id: string): Promise<Sale | null> {
  const { data, error } = await supabase
    .from('sales')
    .select('*, customer:customers(*), branch:branches(*), items:sale_items(*, sku:skus(*, variety:varieties(*))), payments(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Sale | null
}

export async function collectPayment(input: {
  saleId: string
  amount: number
  method: PaymentMethod
  reference?: string
}) {
  const { error } = await supabase.rpc('collect_sale_payment', {
    p_sale_id: input.saleId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference || null,
  })
  if (error) throw error
}

export async function fetchOverdueDues(): Promise<InstallmentDue[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('installment_dues')
    .select('*, plan:installment_plans(*, sale:sales(*, customer:customers(*)))')
    .lt('due_date', today)
    .order('due_date')
  if (error) throw error
  return ((data as InstallmentDue[]) ?? []).filter((d) => Number(d.paid_amount) < Number(d.amount))
}

export async function openShift(branchId: string, openingCash: number): Promise<string> {
  const { data, error } = await supabase.rpc('open_cashier_shift', {
    p_branch_id: branchId,
    p_opening_cash: openingCash,
  })
  if (error) throw error
  return data as string
}

export async function closeShift(shiftId: string, countedCash: number, notes?: string) {
  const { error } = await supabase.rpc('close_cashier_shift', {
    p_shift_id: shiftId,
    p_counted_cash: countedCash,
    p_notes: notes || null,
  })
  if (error) throw error
}

export async function fetchOpenShift(cashierId: string, branchId: string): Promise<CashierShift | null> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .eq('branch_id', branchId)
    .eq('status', 'open')
    .maybeSingle()
  if (error) throw error
  return data as CashierShift | null
}
