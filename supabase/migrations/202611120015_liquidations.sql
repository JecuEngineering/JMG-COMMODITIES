-- 015: liquidations as a first-class module
--
-- A released fund request is settled in Liquidations (not inside Fund Requests).
-- Each liquidation stores what was requested, the expense lines, and what came back.
-- Apply in Supabase SQL Editor. Safe to re-run.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'liquidation_status') then
    create type public.liquidation_status as enum ('draft', 'submitted');
  end if;
end $$;

create table if not exists public.liquidations (
  id uuid primary key default gen_random_uuid(),
  fund_request_id uuid not null unique references public.fund_requests (id),
  branch_id uuid not null references public.branches (id),
  requested_amount numeric(14, 2) not null check (requested_amount >= 0),
  actual_spent numeric(14, 2) not null default 0 check (actual_spent >= 0),
  returned_amount numeric(14, 2) not null default 0 check (returned_amount >= 0),
  status public.liquidation_status not null default 'draft',
  notes text,
  prepared_by uuid references public.profiles (id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.liquidation_items (
  id uuid primary key default gen_random_uuid(),
  liquidation_id uuid not null references public.liquidations (id) on delete cascade,
  expense_date date not null default current_date,
  category text not null default 'Other',
  description text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists liquidations_branch_id_idx on public.liquidations (branch_id);
create index if not exists liquidation_items_liquidation_id_idx on public.liquidation_items (liquidation_id);

drop trigger if exists liquidations_set_updated_at on public.liquidations;
create trigger liquidations_set_updated_at
before update on public.liquidations
for each row execute function public.set_updated_at();

alter table public.liquidations enable row level security;
alter table public.liquidation_items enable row level security;

drop policy if exists liquidations_select on public.liquidations;
create policy liquidations_select on public.liquidations
for select to authenticated
using (
  public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
  or (public.current_role() in ('employee', 'warehouse') and branch_id = public.current_branch_id())
);

drop policy if exists liquidations_insert on public.liquidations;
create policy liquidations_insert on public.liquidations
for insert to authenticated
with check (
  public.can_liquidate_fund_request()
  and prepared_by = auth.uid()
  and (
    public.current_role() in ('owner', 'general_accountant', 'system_admin')
    or branch_id = public.current_branch_id()
  )
  and status = 'draft'
);

drop policy if exists liquidations_update on public.liquidations;
create policy liquidations_update on public.liquidations
for update to authenticated
using (
  status = 'draft'
  and (
    public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
    or (public.current_role() in ('employee', 'warehouse') and branch_id = public.current_branch_id())
  )
)
with check (
  public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
  or (public.current_role() in ('employee', 'warehouse') and branch_id = public.current_branch_id())
);

drop policy if exists liquidation_items_select on public.liquidation_items;
create policy liquidation_items_select on public.liquidation_items
for select to authenticated
using (
  exists (
    select 1 from public.liquidations l
    where l.id = liquidation_items.liquidation_id
      and (
        public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
        or (public.current_role() in ('employee', 'warehouse') and l.branch_id = public.current_branch_id())
      )
  )
);

drop policy if exists liquidation_items_write on public.liquidation_items;
create policy liquidation_items_write on public.liquidation_items
for all to authenticated
using (
  exists (
    select 1 from public.liquidations l
    where l.id = liquidation_items.liquidation_id
      and l.status = 'draft'
      and (
        public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
        or (public.current_role() in ('employee', 'warehouse') and l.branch_id = public.current_branch_id())
      )
  )
)
with check (
  exists (
    select 1 from public.liquidations l
    where l.id = liquidation_items.liquidation_id
      and l.status = 'draft'
      and (
        public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
        or (public.current_role() in ('employee', 'warehouse') and l.branch_id = public.current_branch_id())
      )
  )
);

-- System Admin keeps full access like every other module
drop policy if exists liquidations_system_admin on public.liquidations;
create policy liquidations_system_admin on public.liquidations
for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

drop policy if exists liquidation_items_system_admin on public.liquidation_items;
create policy liquidation_items_system_admin on public.liquidation_items
for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());
