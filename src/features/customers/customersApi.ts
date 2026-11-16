import { supabase } from '../../lib/supabase'
import { todayInputValue } from '../../lib/dates'
import type { Customer, PaymentMethod } from '../sales/salesApi'

export interface CustomerSale {
  id: string
  dr_number: string | null
  sale_date: string
  total: number
  amount_paid: number
  balance: number
  payment_type: PaymentMethod
}

export interface CustomerAccount {
  customer: Customer
  balance: number
  openSales: CustomerSale[]
  installmentCount: number
  nextDueDate: string | null
  overdue: boolean
  lastSaleDate: string | null
}

interface OpenSaleRow {
  id: string
  customer_id: string | null
  dr_number: string | null
  sale_date: string
  total: number
  amount_paid: number
  balance: number
  payment_type: PaymentMethod
}

interface DueRow {
  due_date: string
  amount: number
  paid_amount: number
  plan?: { sale?: { customer_id: string | null } | null } | null
}

export async function fetchCustomerAccounts(branchId?: string | null): Promise<CustomerAccount[]> {
  let customerQuery = supabase.from('customers').select('*').is('deleted_at', null).order('name')
  if (branchId) customerQuery = customerQuery.or(`branch_id.eq.${branchId},branch_id.is.null`)

  let saleQuery = supabase
    .from('sales')
    .select('id, customer_id, dr_number, sale_date, total, amount_paid, balance, payment_type')
    .is('deleted_at', null)
    .gt('balance', 0)
    .order('sale_date')
  if (branchId) saleQuery = saleQuery.eq('branch_id', branchId)

  const [customerRes, saleRes, dueRes] = await Promise.all([
    customerQuery,
    saleQuery,
    supabase
      .from('installment_dues')
      .select('due_date, amount, paid_amount, plan:installment_plans(sale:sales(customer_id))')
      .order('due_date'),
  ])

  if (customerRes.error) throw customerRes.error
  if (saleRes.error) throw saleRes.error
  if (dueRes.error) throw dueRes.error

  const accounts = new Map<string, CustomerAccount>()
  for (const customer of (customerRes.data as Customer[]) ?? []) {
    accounts.set(customer.id, {
      customer,
      balance: 0,
      openSales: [],
      installmentCount: 0,
      nextDueDate: null,
      overdue: false,
      lastSaleDate: null,
    })
  }

  for (const sale of (saleRes.data as OpenSaleRow[]) ?? []) {
    if (!sale.customer_id) continue
    const account = accounts.get(sale.customer_id)
    if (!account) continue
    account.balance += Number(sale.balance)
    account.openSales.push({
      id: sale.id,
      dr_number: sale.dr_number,
      sale_date: sale.sale_date,
      total: Number(sale.total),
      amount_paid: Number(sale.amount_paid),
      balance: Number(sale.balance),
      payment_type: sale.payment_type,
    })
    if (sale.payment_type === 'installment') account.installmentCount += 1
    if (!account.lastSaleDate || sale.sale_date > account.lastSaleDate) {
      account.lastSaleDate = sale.sale_date
    }
  }

  const today = todayInputValue()
  for (const due of (dueRes.data as DueRow[]) ?? []) {
    if (Number(due.paid_amount) >= Number(due.amount)) continue
    const customerId = due.plan?.sale?.customer_id
    if (!customerId) continue
    const account = accounts.get(customerId)
    if (!account) continue
    if (!account.nextDueDate || due.due_date < account.nextDueDate) account.nextDueDate = due.due_date
    if (due.due_date < today) account.overdue = true
  }

  return [...accounts.values()].sort((a, b) => {
    if (b.balance !== a.balance) return b.balance - a.balance
    return a.customer.name.localeCompare(b.customer.name)
  })
}

export async function createCustomerRecord(input: {
  name: string
  branch_id?: string | null
  contact?: string
  address?: string
  notes?: string
}): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: input.name,
      branch_id: input.branch_id || null,
      contact: input.contact || null,
      address: input.address || null,
      notes: input.notes || null,
      active: true,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Customer
}

export async function deleteCustomerRecord(id: string): Promise<string> {
  const deletedAt = new Date().toISOString()
  const { error } = await supabase
    .from('customers')
    .update({ active: false, deleted_at: deletedAt })
    .eq('id', id)
  if (error) throw error
  return deletedAt
}

export async function updateCustomerRecord(
  id: string,
  input: {
    name: string
    contact?: string
    address?: string
    notes?: string
    active: boolean
  },
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({
      name: input.name,
      contact: input.contact || null,
      address: input.address || null,
      notes: input.notes || null,
      active: input.active,
    })
    .eq('id', id)
  if (error) throw error
}
