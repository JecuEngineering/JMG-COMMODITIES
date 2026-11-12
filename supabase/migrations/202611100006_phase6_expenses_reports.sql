-- Phase 6 – Expenses and accounting report helpers

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  category_id uuid references public.expense_categories (id),
  expense_date date not null default current_date,
  amount numeric(14, 2) not null check (amount >= 0),
  payee text,
  notes text,
  receipt_path text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create or replace function public.can_view_expenses()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant','branch_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_expenses()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant','branch_accountant') from public.current_profile()),
    false
  );
$$;

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy expense_categories_select on public.expense_categories
for select to authenticated using (public.can_view_expenses());

create policy expense_categories_write on public.expense_categories
for all to authenticated
using (public.current_role() in ('owner','general_accountant','system_admin'))
with check (public.current_role() in ('owner','general_accountant','system_admin'));

create policy expenses_select on public.expenses
for select to authenticated
using (
  deleted_at is null
  and public.can_view_expenses()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
);

create policy expenses_write on public.expenses
for all to authenticated
using (
  public.can_manage_expenses()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
)
with check (
  public.can_manage_expenses()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
);

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

create policy expense_receipts_read on storage.objects
for select to authenticated
using (bucket_id = 'expense-receipts' and public.can_view_expenses());

create policy expense_receipts_write on storage.objects
for all to authenticated
using (bucket_id = 'expense-receipts' and public.can_manage_expenses())
with check (bucket_id = 'expense-receipts' and public.can_manage_expenses());

insert into public.expense_categories (name)
values ('Utilities'), ('Trucking'), ('Labor'), ('Supplies'), ('Repairs'), ('Other')
on conflict (name) do nothing;

-- Daily sales summary helper view
create or replace view public.v_daily_sales as
select
  s.branch_id,
  s.sale_date,
  count(*) as sale_count,
  coalesce(sum(s.total), 0) as sales_total,
  coalesce(sum(s.amount_paid), 0) as collected_total,
  coalesce(sum(s.balance), 0) as balance_total
from public.sales s
where s.deleted_at is null
  and s.status = 'completed'
group by s.branch_id, s.sale_date;

grant select on public.v_daily_sales to authenticated;
