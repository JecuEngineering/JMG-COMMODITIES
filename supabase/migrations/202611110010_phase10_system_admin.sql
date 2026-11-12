-- Phase 10 – System Admin is a superuser
-- Lets System Admin open and operate every module (all branches),
-- matching the UI permission model in src/lib/roles.ts.
-- Run AFTER phase 8 (fund requests) and phase 9 (inquiries).

-- 1) Permission helpers ------------------------------------------------------

create or replace function public.can_view_products()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_products()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role = 'owner' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_prices()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_inventory()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('owner', 'general_accountant', 'branch_accountant', 'cashier', 'warehouse')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_all_branches_inventory()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_create_stock_ops()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('warehouse', 'branch_accountant', 'owner')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_approve_stock_ops()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'branch_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_suppliers()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_containers()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('owner', 'general_accountant', 'branch_accountant', 'warehouse')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_receive_containers()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('warehouse', 'branch_accountant', 'owner')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_sales()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('owner', 'general_accountant', 'branch_accountant', 'cashier')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_create_sales()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('cashier', 'branch_accountant', 'owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_expenses()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant', 'branch_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_expenses()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant', 'branch_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_view_pcf()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant', 'branch_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_manage_pcf()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant', 'branch_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_replenish_pcf()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_create_fund_request()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role in ('employee', 'warehouse')
     from public.current_profile()),
    false
  );
$$;

create or replace function public.can_review_fund_request()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role = 'branch_accountant' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_approve_fund_request()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role = 'owner' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_release_fund_request()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin' or role = 'general_accountant' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_liquidate_fund_request()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'system_admin'
        or role in ('employee', 'warehouse', 'branch_accountant', 'owner', 'general_accountant')
     from public.current_profile()),
    false
  );
$$;

-- System Admin can work in any branch
create or replace function public.assert_branch_access(p_branch_id uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.app_role;
  v_branch uuid;
begin
  select role, branch_id into v_role, v_branch from public.current_profile();
  if v_role is null then
    raise exception 'Not authenticated';
  end if;
  if v_role in ('owner', 'general_accountant', 'system_admin') then
    return;
  end if;
  if v_branch is distinct from p_branch_id then
    raise exception 'No access to this branch';
  end if;
end;
$$;

-- 2) Table access ------------------------------------------------------------

do $$
declare
  t text;
  v_tables text[] := array[
    'audit_log', 'branch_dr_counters', 'branches', 'cashier_shifts',
    'company_settings', 'container_costs', 'container_lines', 'containers',
    'customers', 'delivery_receipts', 'expense_categories', 'expenses',
    'fund_request_steps', 'fund_requests', 'inquiries', 'installment_dues',
    'installment_plans', 'liquidation_receipts', 'payments', 'pcf_funds',
    'pcf_replenishments', 'pcf_vouchers', 'prices', 'profiles', 'purchases',
    'repacking', 'repacking_lines', 'sale_items', 'sales', 'skus',
    'stock_adjustments', 'stock_movements', 'suppliers', 'transfer_lines',
    'transfers', 'varieties'
  ];
begin
  foreach t in array v_tables loop
    -- some tables may not exist yet if phase 8/9 was skipped
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_system_admin_all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_system_admin()) with check (public.is_system_admin())',
        t || '_system_admin_all', t
      );
    end if;
  end loop;
end $$;

-- Storage buckets used by the app
do $$
declare
  b text;
  v_buckets text[] := array['expense-receipts', 'pcf-receipts', 'fund-request-attachments'];
begin
  foreach b in array v_buckets loop
    if exists (select 1 from storage.buckets where id = b) then
      execute format('drop policy if exists %I on storage.objects', b || '_system_admin_all');
      execute format(
        'create policy %I on storage.objects for all to authenticated using (bucket_id = %L and public.is_system_admin()) with check (bucket_id = %L and public.is_system_admin())',
        b || '_system_admin_all', b, b
      );
    end if;
  end loop;
end $$;
