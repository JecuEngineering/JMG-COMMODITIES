-- Phase 7 – Petty cash fund (PCF) per branch
-- pcf_funds, pcf_vouchers, pcf_replenishments
-- Running balance = opening fund - vouchers + replenishments (derived, never stored)

create table public.pcf_funds (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  custodian_id uuid references public.profiles (id),
  fund_amount numeric(14, 2) not null check (fund_amount >= 0),
  low_threshold numeric(14, 2) not null default 1000 check (low_threshold >= 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index pcf_funds_branch_active_idx
  on public.pcf_funds (branch_id)
  where active and deleted_at is null;

create trigger pcf_funds_set_updated_at
before update on public.pcf_funds
for each row execute function public.set_updated_at();

create table public.pcf_vouchers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.pcf_funds (id),
  voucher_date date not null default current_date,
  payee text not null,
  purpose text,
  category text,
  amount numeric(14, 2) not null check (amount > 0),
  receipt_path text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger pcf_vouchers_set_updated_at
before update on public.pcf_vouchers
for each row execute function public.set_updated_at();

create table public.pcf_replenishments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.pcf_funds (id),
  replenishment_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  vouchers_covered integer,
  reference_no text,
  released_by uuid references public.profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

-- Running balance view (source of truth)
create or replace view public.v_pcf_fund_balances as
select
  f.id as fund_id,
  f.branch_id,
  b.name as branch_name,
  f.custodian_id,
  f.fund_amount,
  f.low_threshold,
  f.active,
  coalesce(sum(case when v.deleted_at is null then v.amount else 0 end), 0) as vouchers_total,
  coalesce(sum(r.amount), 0) as replenishments_total,
  f.fund_amount
    - coalesce(sum(case when v.deleted_at is null then v.amount else 0 end), 0)
    + coalesce(sum(r.amount), 0) as balance,
  (
    f.fund_amount
    - coalesce(sum(case when v.deleted_at is null then v.amount else 0 end), 0)
    + coalesce(sum(r.amount), 0)
  ) <= f.low_threshold as is_low
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
left join public.pcf_vouchers v on v.fund_id = f.id
left join public.pcf_replenishments r on r.fund_id = f.id
where f.deleted_at is null
group by f.id, b.name;

grant select on public.v_pcf_fund_balances to authenticated;

-- RLS helpers
create or replace function public.can_view_pcf()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant','branch_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_pcf()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant','branch_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_replenish_pcf()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('owner','general_accountant') from public.current_profile()),
    false
  );
$$;

alter table public.pcf_funds enable row level security;
alter table public.pcf_vouchers enable row level security;
alter table public.pcf_replenishments enable row level security;

-- pcf_funds policies
create policy pcf_funds_select on public.pcf_funds
for select to authenticated
using (
  deleted_at is null
  and public.can_view_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
);

create policy pcf_funds_write on public.pcf_funds
for all to authenticated
using (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
)
with check (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
);

-- pcf_vouchers policies
create policy pcf_vouchers_select on public.pcf_vouchers
for select to authenticated
using (
  deleted_at is null
  and public.can_view_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

create policy pcf_vouchers_write on public.pcf_vouchers
for all to authenticated
using (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
)
with check (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

-- pcf_replenishments policies
create policy pcf_replenishments_select on public.pcf_replenishments
for select to authenticated
using (
  public.can_view_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

create policy pcf_replenishments_write on public.pcf_replenishments
for all to authenticated
using (
  public.can_replenish_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
)
with check (
  public.can_replenish_pcf()
  and (
    public.current_role() in ('owner','general_accountant')
    or fund_id in (
      select id from public.pcf_funds where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

-- Storage bucket for PCF voucher receipts
insert into storage.buckets (id, name, public)
values ('pcf-receipts', 'pcf-receipts', false)
on conflict (id) do nothing;

create policy pcf_receipts_read on storage.objects
for select to authenticated
using (bucket_id = 'pcf-receipts' and public.can_view_pcf());

create policy pcf_receipts_write on storage.objects
for all to authenticated
using (bucket_id = 'pcf-receipts' and public.can_manage_pcf())
with check (bucket_id = 'pcf-receipts' and public.can_manage_pcf());

-- Seed a default PCF fund for each existing active branch (opening amount 10,000)
insert into public.pcf_funds (branch_id, fund_amount, low_threshold, active)
select b.id, 10000, 1000, true
from public.branches b
where b.deleted_at is null and b.active = true
  and not exists (
    select 1 from public.pcf_funds f
    where f.branch_id = b.id and f.active and f.deleted_at is null
  );
