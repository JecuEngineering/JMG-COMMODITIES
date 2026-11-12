-- 014: branch map coordinates, container numbers, staff account editing
--
-- Apply in Supabase SQL Editor (or `supabase db push`). Safe to re-run.

-- 1. Exact map pin for a branch (set from Settings → Branches)
alter table public.branches
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);

-- 2. Shipping container number (e.g. MSKU1234567), separate from the supplier ref
alter table public.containers
  add column if not exists container_number text;

-- 3. Owners and General Accountants may edit staff profiles.
--    Passwords are auth credentials and stay System Admin-only (admin-update-user function).
drop policy if exists profiles_manage_owner_ga on public.profiles;
create policy profiles_manage_owner_ga on public.profiles
for update to authenticated
using (
  public.current_role() in ('owner', 'general_accountant')
  and role <> 'system_admin'
)
with check (
  public.current_role() in ('owner', 'general_accountant')
  and role <> 'system_admin'
);

-- 4. Public branch directory returns coordinates so the website can drop an exact pin
drop function if exists public.public_branches();
create function public.public_branches()
returns table (
  id uuid,
  name text,
  address text,
  contact text,
  latitude numeric,
  longitude numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name, b.address, b.contact, b.latitude, b.longitude
  from public.branches b
  where b.deleted_at is null
    and b.active = true
  order by b.name;
$$;

revoke all on function public.public_branches() from public;
grant execute on function public.public_branches() to anon, authenticated;

-- 5. The Customers module is also available to the General Accountant
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
for all to authenticated
using (public.can_create_sales() or public.current_role() in ('general_accountant', 'system_admin'))
with check (public.can_create_sales() or public.current_role() in ('general_accountant', 'system_admin'));
