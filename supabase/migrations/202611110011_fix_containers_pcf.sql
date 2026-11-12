-- Fix pass – containers RLS recursion + PCF fund balances view
-- Applied to hosted project after phases 1–10.

-- 1) Containers: `containers_select` referenced container_lines, whose policy
--    referenced containers again → 42P17 infinite recursion. Visibility now
--    runs through a security-definer helper that bypasses RLS internally.
create or replace function public.can_view_container(p_container_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.containers c
    where c.id = p_container_id
      and c.deleted_at is null
      and public.can_view_containers()
      and (
        public.can_view_all_branches_inventory()
        or public.current_role() in ('owner', 'general_accountant')
        or c.primary_branch_id = public.current_branch_id()
        or exists (
          select 1 from public.container_lines cl
          where cl.container_id = c.id
            and cl.branch_id = public.current_branch_id()
        )
      )
  );
$$;

grant execute on function public.can_view_container(uuid) to authenticated;

drop policy if exists containers_select on public.containers;
create policy containers_select on public.containers
for select to authenticated
using (public.can_view_container(id));

drop policy if exists container_lines_select on public.container_lines;
create policy container_lines_select on public.container_lines
for select to authenticated
using (public.can_view_container(container_id));

drop policy if exists container_costs_select on public.container_costs;
create policy container_costs_select on public.container_costs
for select to authenticated
using (public.can_view_container(container_id));

-- 2) PCF balances: the view joined vouchers and replenishments in one query,
--    multiplying the sums (vouchers × replenishments). Rewritten with scalar
--    subqueries, exposing branch/custodian as JSON (PostgREST cannot embed
--    relations through a view), and security_invoker so base-table RLS applies.
drop view if exists public.v_pcf_fund_balances;

create view public.v_pcf_fund_balances
with (security_invoker = true)
as
select
  f.id,
  f.branch_id,
  b.name as branch_name,
  f.custodian_id,
  f.fund_amount,
  f.low_threshold,
  f.active,
  f.notes,
  f.created_at,
  f.updated_at,
  f.deleted_at,
  coalesce((
    select sum(v.amount) from public.pcf_vouchers v
    where v.fund_id = f.id and v.deleted_at is null
  ), 0) as vouchers_total,
  coalesce((
    select sum(r.amount) from public.pcf_replenishments r
    where r.fund_id = f.id
  ), 0) as replenishments_total,
  f.fund_amount
    - coalesce((
        select sum(v.amount) from public.pcf_vouchers v
        where v.fund_id = f.id and v.deleted_at is null
      ), 0)
    + coalesce((
        select sum(r.amount) from public.pcf_replenishments r
        where r.fund_id = f.id
      ), 0) as balance,
  (
    f.fund_amount
    - coalesce((
        select sum(v.amount) from public.pcf_vouchers v
        where v.fund_id = f.id and v.deleted_at is null
      ), 0)
    + coalesce((
        select sum(r.amount) from public.pcf_replenishments r
        where r.fund_id = f.id
      ), 0)
  ) <= f.low_threshold as is_low,
  to_jsonb(b) as branch,
  jsonb_build_object('id', p.id, 'full_name', p.full_name) as custodian
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
left join public.profiles p on p.id = f.custodian_id
where f.deleted_at is null;

grant select on public.v_pcf_fund_balances to authenticated;
