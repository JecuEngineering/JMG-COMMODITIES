-- Phase 4 – Containers and suppliers
-- suppliers, purchases, containers + landed costs → stock in on receive

create type public.container_status as enum (
  'in_transit',
  'arrived',
  'unloading',
  'received',
  'closed'
);

create type public.purchase_status as enum (
  'draft',
  'ordered',
  'partial',
  'paid',
  'cancelled'
);

create type public.container_cost_type as enum (
  'purchase',
  'freight',
  'duties',
  'handling',
  'trucking',
  'other'
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  purchase_date date not null default current_date,
  total numeric(14, 2) not null default 0 check (total >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  status public.purchase_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  purchase_id uuid references public.purchases (id),
  supplier_ref text not null,
  origin text,
  expected_arrival date,
  arrival_date date,
  status public.container_status not null default 'in_transit',
  primary_branch_id uuid references public.branches (id),
  notes text,
  unloading_notes text,
  received_at timestamptz,
  received_by uuid references public.profiles (id),
  closed_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.container_lines (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.containers (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  branch_id uuid not null references public.branches (id),
  expected_sacks numeric(14, 3) not null default 0 check (expected_sacks >= 0),
  actual_sacks numeric(14, 3),
  cost_per_sack numeric(14, 2),
  difference_reason text,
  unique (container_id, sku_id, branch_id)
);

create table public.container_costs (
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.containers (id) on delete cascade,
  cost_type public.container_cost_type not null,
  amount numeric(14, 2) not null check (amount >= 0),
  reference_no text,
  notes text,
  created_at timestamptz not null default now()
);

create index containers_status_idx on public.containers (status);
create index containers_supplier_idx on public.containers (supplier_id);
create index container_lines_container_idx on public.container_lines (container_id);

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

create trigger purchases_set_updated_at
before update on public.purchases
for each row execute function public.set_updated_at();

create trigger containers_set_updated_at
before update on public.containers
for each row execute function public.set_updated_at();

create or replace function public.can_manage_suppliers()
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

create or replace function public.can_view_containers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role in ('owner', 'general_accountant', 'branch_accountant', 'warehouse')
      from public.current_profile()
    ),
    false
  );
$$;

create or replace function public.can_receive_containers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('warehouse', 'branch_accountant', 'owner') from public.current_profile()),
    false
  );
$$;

-- Receive container: set actuals, allocate landed cost, post stock_in per branch line
create or replace function public.receive_container(
  p_container_id uuid,
  p_lines jsonb,
  p_unloading_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.containers;
  v_item jsonb;
  v_line public.container_lines;
  v_total_cost numeric(14, 2);
  v_total_sacks numeric(14, 3);
  v_cost_per numeric(14, 2);
  v_actual numeric(14, 3);
begin
  if not public.can_receive_containers() then
    raise exception 'Not allowed to receive containers';
  end if;

  select * into v_c from public.containers where id = p_container_id and deleted_at is null for update;
  if not found then raise exception 'Container not found'; end if;
  if v_c.status not in ('arrived', 'unloading', 'in_transit') then
    raise exception 'Container cannot be received from status %', v_c.status;
  end if;

  -- Branch-scoped staff may receive containers assigned to their branch
  if v_c.primary_branch_id is not null then
    perform public.assert_branch_access(v_c.primary_branch_id);
  elsif not public.can_view_all_branches_inventory() and public.current_role() <> 'owner' then
    raise exception 'Container has no primary branch';
  end if;

  -- Update actual sacks from payload
  for v_item in select * from jsonb_array_elements(p_lines)
  loop
    update public.container_lines
    set
      actual_sacks = (v_item->>'actual_sacks')::numeric,
      difference_reason = nullif(v_item->>'difference_reason', '')
    where id = (v_item->>'line_id')::uuid
      and container_id = p_container_id;
  end loop;

  select coalesce(sum(amount), 0) into v_total_cost
  from public.container_costs
  where container_id = p_container_id;

  select coalesce(sum(coalesce(actual_sacks, expected_sacks)), 0) into v_total_sacks
  from public.container_lines
  where container_id = p_container_id;

  if v_total_sacks <= 0 then
    raise exception 'No sacks to receive';
  end if;

  v_cost_per := round(v_total_cost / v_total_sacks, 2);

  for v_line in select * from public.container_lines where container_id = p_container_id
  loop
    v_actual := coalesce(v_line.actual_sacks, v_line.expected_sacks);
    if v_actual is null or v_actual < 0 then
      raise exception 'Invalid actual sacks on a container line';
    end if;

    update public.container_lines
    set actual_sacks = v_actual, cost_per_sack = v_cost_per
    where id = v_line.id;

    if v_actual > 0 then
      insert into public.stock_movements (
        sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
      ) values (
        v_line.sku_id,
        v_line.branch_id,
        v_actual,
        'stock_in',
        'containers',
        p_container_id,
        format('Container %s receive @ %s/sack', coalesce(v_c.supplier_ref, p_container_id::text), v_cost_per),
        auth.uid()
      );
    end if;
  end loop;

  update public.containers
  set
    status = 'received',
    arrival_date = coalesce(arrival_date, current_date),
    unloading_notes = coalesce(p_unloading_notes, unloading_notes),
    received_at = now(),
    received_by = auth.uid()
  where id = p_container_id;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(),
    'container_receive',
    'containers',
    p_container_id,
    jsonb_build_object(
      'total_cost', v_total_cost,
      'total_sacks', v_total_sacks,
      'cost_per_sack', v_cost_per,
      'lines', p_lines
    )
  );
end;
$$;

create or replace function public.close_container(p_container_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.containers;
begin
  if not public.can_manage_suppliers() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to close containers';
  end if;
  select * into v_c from public.containers where id = p_container_id for update;
  if not found then raise exception 'Container not found'; end if;
  if v_c.status <> 'received' then
    raise exception 'Only received containers can be closed';
  end if;
  update public.containers set status = 'closed', closed_at = now() where id = p_container_id;
  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (auth.uid(), 'container_close', 'containers', p_container_id, jsonb_build_object('status', 'closed'));
end;
$$;

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.containers enable row level security;
alter table public.container_lines enable row level security;
alter table public.container_costs enable row level security;

create policy suppliers_select on public.suppliers
for select to authenticated
using (deleted_at is null and public.can_view_containers());

create policy suppliers_write on public.suppliers
for all to authenticated
using (public.can_manage_suppliers())
with check (public.can_manage_suppliers());

create policy purchases_select on public.purchases
for select to authenticated
using (deleted_at is null and public.can_view_containers());

create policy purchases_write on public.purchases
for all to authenticated
using (public.can_manage_suppliers())
with check (public.can_manage_suppliers());

create policy containers_select on public.containers
for select to authenticated
using (
  deleted_at is null
  and public.can_view_containers()
  and (
    public.can_view_all_branches_inventory()
    or public.current_role() in ('owner', 'general_accountant')
    or primary_branch_id = public.current_branch_id()
    or exists (
      select 1 from public.container_lines cl
      where cl.container_id = containers.id
        and cl.branch_id = public.current_branch_id()
    )
  )
);

create policy containers_write on public.containers
for all to authenticated
using (public.can_manage_suppliers() or public.can_receive_containers())
with check (public.can_manage_suppliers() or public.can_receive_containers());

create policy container_lines_select on public.container_lines
for select to authenticated
using (
  exists (
    select 1 from public.containers c
    where c.id = container_id and c.deleted_at is null and public.can_view_containers()
  )
);

create policy container_lines_write on public.container_lines
for all to authenticated
using (public.can_manage_suppliers() or public.can_receive_containers())
with check (public.can_manage_suppliers() or public.can_receive_containers());

create policy container_costs_select on public.container_costs
for select to authenticated
using (
  exists (
    select 1 from public.containers c
    where c.id = container_id and public.can_view_containers()
  )
);

create policy container_costs_write on public.container_costs
for all to authenticated
using (public.can_manage_suppliers())
with check (public.can_manage_suppliers());

-- receive_container inserts stock_movements as security definer — bypasses RLS insert deny
grant execute on function public.receive_container to authenticated;
grant execute on function public.close_container to authenticated;
