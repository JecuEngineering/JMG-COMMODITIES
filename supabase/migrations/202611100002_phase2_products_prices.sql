-- Phase 2 – Products and prices
-- varieties, skus, prices + RLS + price-change audit

create type public.variety_origin as enum ('local', 'imported');

create table public.varieties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  origin public.variety_origin not null default 'local',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  variety_id uuid not null references public.varieties (id),
  sack_size smallint not null check (sack_size in (5, 25, 50)),
  barcode text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (variety_id, sack_size)
);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id),
  price numeric(14, 2) not null check (price >= 0),
  effective_from date not null default current_date,
  set_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index skus_variety_id_idx on public.skus (variety_id);
create index prices_sku_id_idx on public.prices (sku_id);
create index prices_effective_from_idx on public.prices (sku_id, effective_from desc);

create trigger varieties_set_updated_at
before update on public.varieties
for each row execute function public.set_updated_at();

create trigger skus_set_updated_at
before update on public.skus
for each row execute function public.set_updated_at();

create or replace function public.can_manage_products()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'system_admin') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_prices()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'general_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_products()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role in (
        'owner',
        'general_accountant',
        'branch_accountant',
        'cashier',
        'warehouse',
        'system_admin'
      )
      from public.current_profile()
    ),
    false
  );
$$;

create or replace function public.log_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (user_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(),
    'price_set',
    'prices',
    new.id,
    null,
    jsonb_build_object(
      'sku_id', new.sku_id,
      'price', new.price,
      'effective_from', new.effective_from,
      'set_by', new.set_by
    )
  );
  return new;
end;
$$;

create trigger prices_audit_insert
after insert on public.prices
for each row execute function public.log_price_change();

alter table public.varieties enable row level security;
alter table public.skus enable row level security;
alter table public.prices enable row level security;

create policy varieties_select on public.varieties
for select to authenticated
using (deleted_at is null and public.can_view_products());

create policy varieties_write on public.varieties
for all to authenticated
using (public.can_manage_products())
with check (public.can_manage_products());

create policy skus_select on public.skus
for select to authenticated
using (deleted_at is null and public.can_view_products());

create policy skus_write on public.skus
for all to authenticated
using (public.can_manage_products())
with check (public.can_manage_products());

create policy prices_select on public.prices
for select to authenticated
using (public.can_view_products());

create policy prices_insert on public.prices
for insert to authenticated
with check (public.can_manage_prices());

-- Prices are immutable history rows: no update/delete for authenticated users.
-- Changing a price = insert a new row with a new effective_from.
