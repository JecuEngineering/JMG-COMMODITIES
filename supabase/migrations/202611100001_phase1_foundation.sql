-- Phase 1 – Foundation
-- branches, profiles, company_settings, audit_log + RLS

create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'owner',
  'general_accountant',
  'branch_accountant',
  'cashier',
  'warehouse',
  'employee',
  'system_admin'
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'employee',
  branch_id uuid references public.branches (id),
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'JMG Commodities Inc.',
  address text,
  tin text,
  contacts text,
  logo_url text,
  dr_prefix text default 'DR',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  action text not null,
  table_name text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index profiles_branch_id_idx on public.profiles (branch_id);
create index profiles_role_idx on public.profiles (role);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_table_idx on public.audit_log (table_name);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where id = auth.uid()
    and active = true
    and deleted_at is null
  limit 1;
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.current_profile();
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.current_profile();
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'system_admin' from public.current_profile()), false);
$$;

create or replace function public.is_owner_or_admin()
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'New user'),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'employee')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.audit_log enable row level security;

-- Branches
create policy branches_select on public.branches
for select to authenticated
using (
  deleted_at is null
  and (
    public.current_role() in ('owner', 'general_accountant', 'system_admin')
    or id = public.current_branch_id()
  )
);

create policy branches_write on public.branches
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

-- Profiles
create policy profiles_select on public.profiles
for select to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or public.current_role() in ('owner', 'general_accountant', 'system_admin')
    or (
      public.current_role() = 'branch_accountant'
      and branch_id = public.current_branch_id()
    )
  )
);

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
for all to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());

-- Company settings: readable on login (anon) and in-app (authenticated)
create policy company_settings_select on public.company_settings
for select to anon, authenticated
using (true);

create policy company_settings_write on public.company_settings
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

-- Audit log
create policy audit_log_select on public.audit_log
for select to authenticated
using (public.current_role() in ('owner', 'general_accountant', 'system_admin'));

create policy audit_log_insert on public.audit_log
for insert to authenticated
with check (user_id = auth.uid() or user_id is null);

insert into public.company_settings (name, address, tin, contacts, dr_prefix)
values (
  'JMG Commodities Inc.',
  null,
  null,
  null,
  'DR'
);

insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

create policy company_assets_public_read
on storage.objects for select
to public
using (bucket_id = 'company-assets');

create policy company_assets_admin_write
on storage.objects for all
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_owner_or_admin()
)
with check (
  bucket_id = 'company-assets'
  and public.is_owner_or_admin()
);
