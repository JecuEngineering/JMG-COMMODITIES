-- Phase 5 – Sales, customers, installments, Delivery Receipts, cashier shifts

create type public.payment_method as enum ('cash', 'gcash', 'bank', 'check', 'installment');
create type public.sale_status as enum ('completed', 'void');
create type public.shift_status as enum ('open', 'closed');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id),
  name text not null,
  contact text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  status public.shift_status not null default 'open',
  opened_at timestamptz not null default now(),
  opening_cash numeric(14, 2) not null default 0,
  closed_at timestamptz,
  expected_cash numeric(14, 2),
  counted_cash numeric(14, 2),
  difference numeric(14, 2),
  notes text
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  customer_id uuid references public.customers (id),
  cashier_id uuid references public.profiles (id),
  shift_id uuid references public.cashier_shifts (id),
  sale_date date not null default current_date,
  status public.sale_status not null default 'completed',
  payment_type public.payment_method not null,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  balance numeric(14, 2) not null default 0,
  dr_number text,
  or_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  sacks numeric(14, 3) not null check (sacks > 0),
  price_per_sack numeric(14, 2) not null check (price_per_sack >= 0),
  discount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null check (line_total >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference_no text,
  received_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales (id) on delete cascade,
  total numeric(14, 2) not null,
  number_of_parts integer not null check (number_of_parts >= 1),
  created_at timestamptz not null default now()
);

create table public.installment_dues (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.installment_plans (id) on delete cascade,
  due_date date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  sequence_no integer not null default 1
);

create table public.delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  dr_number text not null,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (branch_id, dr_number)
);

create table public.branch_dr_counters (
  branch_id uuid primary key references public.branches (id),
  next_number integer not null default 1
);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger sales_set_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

create or replace function public.can_view_sales()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant','branch_accountant','cashier') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_create_sales()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('cashier','branch_accountant','owner') from public.current_profile()),
    false
  );
$$;

create or replace function public.next_dr_number(p_branch_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
  v_prefix text;
begin
  insert into public.branch_dr_counters (branch_id, next_number)
  values (p_branch_id, 1)
  on conflict (branch_id) do nothing;

  update public.branch_dr_counters
  set next_number = next_number + 1
  where branch_id = p_branch_id
  returning next_number - 1 into v_n;

  select coalesce(dr_prefix, 'DR') into v_prefix
  from public.company_settings
  order by updated_at desc
  limit 1;

  return format('%s-%s-%s', v_prefix, left(p_branch_id::text, 4), lpad(v_n::text, 5, '0'));
end;
$$;

-- Create sale: items JSON [{sku_id, sacks, price_per_sack, discount}], optional installment parts
create or replace function public.create_sale(
  p_branch_id uuid,
  p_customer_id uuid,
  p_payment_type public.payment_method,
  p_items jsonb,
  p_or_number text default null,
  p_notes text default null,
  p_down_payment numeric default 0,
  p_installment_parts integer default 1,
  p_first_due_date date default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_sale_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_sku uuid;
  v_sacks numeric;
  v_price numeric;
  v_disc numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_dr text;
  v_plan_id uuid;
  v_part numeric;
  v_i integer;
  v_due date;
  v_paid numeric := 0;
begin
  if not public.can_create_sales() then
    raise exception 'Not allowed to create sales';
  end if;
  perform public.assert_branch_access(p_branch_id);

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale needs at least one item';
  end if;

  select id into v_shift_id
  from public.cashier_shifts
  where cashier_id = auth.uid()
    and branch_id = p_branch_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := (v_item->>'sku_id')::uuid;
    v_sacks := (v_item->>'sacks')::numeric;
    v_price := (v_item->>'price_per_sack')::numeric;
    v_disc := coalesce((v_item->>'discount')::numeric, 0);
    v_line := round((v_sacks * v_price) - v_disc, 2);
    if v_sacks <= 0 or v_price < 0 or v_line < 0 then
      raise exception 'Invalid sale line';
    end if;
    if public.stock_on_hand(p_branch_id, v_sku) < v_sacks then
      raise exception 'Insufficient stock for SKU %', v_sku;
    end if;
    v_subtotal := v_subtotal + round(v_sacks * v_price, 2);
    v_total := v_total + v_line;
  end loop;

  v_dr := public.next_dr_number(p_branch_id);

  if p_payment_type = 'installment' then
    v_paid := greatest(coalesce(p_down_payment, 0), 0);
    if v_paid > v_total then
      raise exception 'Down payment cannot exceed total';
    end if;
  else
    v_paid := v_total;
  end if;

  insert into public.sales (
    branch_id, customer_id, cashier_id, shift_id, payment_type,
    subtotal, discount, total, amount_paid, balance, dr_number, or_number, notes
  ) values (
    p_branch_id, p_customer_id, auth.uid(), v_shift_id, p_payment_type,
    v_subtotal, v_subtotal - v_total, v_total, v_paid, v_total - v_paid, v_dr, p_or_number, p_notes
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sku := (v_item->>'sku_id')::uuid;
    v_sacks := (v_item->>'sacks')::numeric;
    v_price := (v_item->>'price_per_sack')::numeric;
    v_disc := coalesce((v_item->>'discount')::numeric, 0);
    v_line := round((v_sacks * v_price) - v_disc, 2);

    insert into public.sale_items (sale_id, sku_id, sacks, price_per_sack, discount, line_total)
    values (v_sale_id, v_sku, v_sacks, v_price, v_disc, v_line);

    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
    ) values (
      v_sku, p_branch_id, -v_sacks, 'sale', 'sales', v_sale_id, 'Sale DR ' || v_dr, auth.uid()
    );
  end loop;

  if p_payment_type <> 'installment' then
    insert into public.payments (sale_id, amount, method, received_by)
    values (v_sale_id, v_total, p_payment_type, auth.uid());
  else
    if v_paid > 0 then
      insert into public.payments (sale_id, amount, method, received_by, notes)
      values (v_sale_id, v_paid, 'cash', auth.uid(), 'Down payment');
    end if;

    insert into public.installment_plans (sale_id, total, number_of_parts)
    values (v_sale_id, v_total, greatest(coalesce(p_installment_parts, 1), 1))
    returning id into v_plan_id;

    v_part := round((v_total - v_paid) / greatest(p_installment_parts, 1), 2);
    v_due := coalesce(p_first_due_date, current_date + 30);

    for v_i in 1..greatest(p_installment_parts, 1)
    loop
      insert into public.installment_dues (plan_id, due_date, amount, paid_amount, sequence_no)
      values (
        v_plan_id,
        v_due + ((v_i - 1) * 30),
        case when v_i = greatest(p_installment_parts, 1)
          then (v_total - v_paid) - (v_part * (greatest(p_installment_parts, 1) - 1))
          else v_part
        end,
        0,
        v_i
      );
    end loop;
  end if;

  insert into public.delivery_receipts (sale_id, branch_id, dr_number, printed_at)
  values (v_sale_id, p_branch_id, v_dr, now());

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(), 'sale_create', 'sales', v_sale_id,
    jsonb_build_object('total', v_total, 'payment_type', p_payment_type, 'dr_number', v_dr)
  );

  return v_sale_id;
end;
$$;

create or replace function public.collect_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sale public.sales;
  v_left numeric;
  v_apply numeric;
  v_due public.installment_dues;
begin
  if not public.can_create_sales() then
    raise exception 'Not allowed to collect payments';
  end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  perform public.assert_branch_access(v_sale.branch_id);

  if v_sale.balance <= 0 then raise exception 'Sale already fully paid'; end if;
  if p_amount > v_sale.balance then raise exception 'Payment exceeds balance'; end if;

  insert into public.payments (sale_id, amount, method, reference_no, received_by)
  values (p_sale_id, p_amount, p_method, p_reference, auth.uid());

  update public.sales
  set amount_paid = amount_paid + p_amount,
      balance = balance - p_amount
  where id = p_sale_id;

  -- Apply to earliest unpaid dues (no interest, no penalty)
  v_left := p_amount;
  for v_due in
    select d.*
    from public.installment_dues d
    join public.installment_plans p on p.id = d.plan_id
    where p.sale_id = p_sale_id
      and d.paid_amount < d.amount
    order by d.due_date, d.sequence_no
  loop
    exit when v_left <= 0;
    v_apply := least(v_left, v_due.amount - v_due.paid_amount);
    update public.installment_dues
    set paid_amount = paid_amount + v_apply
    where id = v_due.id;
    v_left := v_left - v_apply;
  end loop;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (auth.uid(), 'payment_collect', 'payments', p_sale_id, jsonb_build_object('amount', p_amount, 'method', p_method));
end;
$$;

create or replace function public.open_cashier_shift(p_branch_id uuid, p_opening_cash numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_create_sales() then raise exception 'Not allowed'; end if;
  perform public.assert_branch_access(p_branch_id);

  if exists (
    select 1 from public.cashier_shifts
    where cashier_id = auth.uid() and branch_id = p_branch_id and status = 'open'
  ) then
    raise exception 'You already have an open shift';
  end if;

  insert into public.cashier_shifts (cashier_id, branch_id, opening_cash)
  values (auth.uid(), p_branch_id, coalesce(p_opening_cash, 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.close_cashier_shift(p_shift_id uuid, p_counted_cash numeric, p_notes text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_shift public.cashier_shifts;
  v_expected numeric;
begin
  select * into v_shift from public.cashier_shifts where id = p_shift_id for update;
  if not found then raise exception 'Shift not found'; end if;
  if v_shift.status <> 'open' then raise exception 'Shift already closed'; end if;
  if v_shift.cashier_id <> auth.uid() and public.current_role() not in ('owner','branch_accountant') then
    raise exception 'Not your shift';
  end if;

  select v_shift.opening_cash + coalesce(sum(p.amount), 0) into v_expected
  from public.payments p
  join public.sales s on s.id = p.sale_id
  where s.shift_id = p_shift_id
    and p.method = 'cash';

  update public.cashier_shifts
  set status = 'closed',
      closed_at = now(),
      expected_cash = coalesce(v_expected, v_shift.opening_cash),
      counted_cash = p_counted_cash,
      difference = p_counted_cash - coalesce(v_expected, v_shift.opening_cash),
      notes = p_notes
  where id = p_shift_id;
end;
$$;

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installment_dues enable row level security;
alter table public.delivery_receipts enable row level security;
alter table public.cashier_shifts enable row level security;
alter table public.branch_dr_counters enable row level security;

create policy customers_select on public.customers for select to authenticated
using (
  deleted_at is null and public.can_view_sales()
  and (public.can_view_all_branches_inventory() or public.current_role() in ('owner','general_accountant') or branch_id = public.current_branch_id() or branch_id is null)
);

create policy customers_write on public.customers for all to authenticated
using (public.can_create_sales())
with check (public.can_create_sales());

create policy sales_select on public.sales for select to authenticated
using (
  deleted_at is null and public.can_view_sales()
  and (public.current_role() in ('owner','general_accountant') or branch_id = public.current_branch_id())
);

create policy sale_items_select on public.sale_items for select to authenticated
using (exists (select 1 from public.sales s where s.id = sale_id and public.can_view_sales()));

create policy payments_select on public.payments for select to authenticated
using (exists (select 1 from public.sales s where s.id = sale_id and public.can_view_sales()));

create policy installment_plans_select on public.installment_plans for select to authenticated
using (exists (select 1 from public.sales s where s.id = sale_id and public.can_view_sales()));

create policy installment_dues_select on public.installment_dues for select to authenticated
using (
  exists (
    select 1 from public.installment_plans p
    join public.sales s on s.id = p.sale_id
    where p.id = plan_id and public.can_view_sales()
  )
);

create policy delivery_receipts_select on public.delivery_receipts for select to authenticated
using (public.can_view_sales());

create policy shifts_select on public.cashier_shifts for select to authenticated
using (
  public.can_view_sales()
  and (public.current_role() in ('owner','general_accountant','branch_accountant') or cashier_id = auth.uid() or branch_id = public.current_branch_id())
);

create policy branch_dr_counters_select on public.branch_dr_counters for select to authenticated
using (public.can_view_sales());

grant execute on function public.create_sale to authenticated;
grant execute on function public.collect_sale_payment to authenticated;
grant execute on function public.open_cashier_shift to authenticated;
grant execute on function public.close_cashier_shift to authenticated;
grant execute on function public.next_dr_number to authenticated;
