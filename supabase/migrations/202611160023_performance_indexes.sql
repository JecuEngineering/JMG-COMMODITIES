-- Performance indexes for the list/dashboard queries added on 2026-11-16.
-- All lists filter deleted_at is null and scope by branch/date; these indexes
-- match those filters so Postgres can use index scans instead of full scans.

-- Sales: history ledger, dashboard day totals, receivables.
create index if not exists sales_branch_date_idx
  on public.sales (branch_id, sale_date desc, created_at desc)
  where deleted_at is null;

create index if not exists sales_customer_idx
  on public.sales (customer_id)
  where deleted_at is null;

create index if not exists sales_open_balance_idx
  on public.sales (branch_id)
  where deleted_at is null and balance > 0;

-- Sale items: ledger line loads and dashboard variety totals.
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_sku_idx on public.sale_items (sku_id);

-- Payments: cash-on-hand card and per-sale payment pills.
create index if not exists payments_sale_idx on public.payments (sale_id);
create index if not exists payments_date_idx on public.payments (payment_date);
create index if not exists payments_method_date_idx on public.payments (method, payment_date);

-- Installments: overdue dues lists.
create index if not exists installment_dues_due_date_idx on public.installment_dues (due_date);
create index if not exists installment_dues_plan_idx on public.installment_dues (plan_id);

-- Expenses and reports.
create index if not exists expenses_branch_date_idx
  on public.expenses (branch_id, expense_date desc)
  where deleted_at is null;

-- Fund requests awaiting action.
create index if not exists fund_requests_branch_status_idx on public.fund_requests (branch_id, status);

-- Customers and petty cash vouchers.
create index if not exists customers_branch_idx
  on public.customers (branch_id)
  where deleted_at is null;

create index if not exists pcf_vouchers_fund_date_idx
  on public.pcf_vouchers (fund_id, voucher_date desc)
  where deleted_at is null;

-- Inventory lists.
create index if not exists stock_adjustments_branch_created_idx
  on public.stock_adjustments (branch_id, created_at desc);
create index if not exists transfers_created_idx on public.transfers (created_at desc);

-- Shifts: cash-on-hand card on the reports page.
create index if not exists cashier_shifts_branch_opened_idx
  on public.cashier_shifts (branch_id, opened_at desc);
