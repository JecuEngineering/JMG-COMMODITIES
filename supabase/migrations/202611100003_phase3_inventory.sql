-- Phase 3 – Inventory
-- stock_movements ledger, adjustments, repacking, transfers + RLS
-- Rule: stock per branch = sum of movements. Never edit a count directly.

alter table public.skus
  add column if not exists reorder_level integer not null default 100 check (reorder_level >= 0);

create type public.stock_movement_type as enum (
  'stock_in',
  'sale',
  'adjustment',
  'repack_in',
  'repack_out',
  'transfer_in',
  'transfer_out'
);

create type public.adjustment_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.transfer_status as enum (
  'draft',
  'in_transit',
  'received',
  'cancelled'
);

create type public.repack_direction as enum ('in', 'out');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus (id),
  branch_id uuid not null references public.branches (id),
  quantity numeric(14, 3) not null,
  movement_type public.stock_movement_type not null,
  reference_table text,
  reference_id uuid,
  note text,
  created_by uuid references public.profiles (id),
  moved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stock_movements_quantity_nonzero check (quantity <> 0)
);

create index stock_movements_branch_sku_idx on public.stock_movements (branch_id, sku_id);
create index stock_movements_moved_at_idx on public.stock_movements (moved_at desc);
create index stock_movements_reference_idx on public.stock_movements (reference_table, reference_id);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  sku_id uuid not null references public.skus (id),
  quantity numeric(14, 3) not null,
  reason text not null,
  status public.adjustment_status not null default 'pending',
  requested_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint stock_adjustments_quantity_nonzero check (quantity <> 0)
);

create table public.repacking (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  repack_date date not null default current_date,
  input_weight_kg numeric(14, 3) not null check (input_weight_kg >= 0),
  output_weight_kg numeric(14, 3) not null check (output_weight_kg >= 0),
  weight_lost_kg numeric(14, 3) generated always as (input_weight_kg - output_weight_kg) stored,
  reason text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.repacking_lines (
  id uuid primary key default gen_random_uuid(),
  repacking_id uuid not null references public.repacking (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  direction public.repack_direction not null,
  sacks numeric(14, 3) not null check (sacks > 0)
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references public.branches (id),
  to_branch_id uuid not null references public.branches (id),
  status public.transfer_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id),
  shipped_at timestamptz,
  received_at timestamptz,
  received_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_different_branches check (from_branch_id <> to_branch_id)
);

create table public.transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  sku_id uuid not null references public.skus (id),
  sacks_sent numeric(14, 3) not null check (sacks_sent > 0),
  sacks_received numeric(14, 3),
  unique (transfer_id, sku_id)
);

create trigger transfers_set_updated_at
before update on public.transfers
for each row execute function public.set_updated_at();

create or replace view public.v_stock_on_hand as
select
  sm.branch_id,
  sm.sku_id,
  sum(sm.quantity) as on_hand
from public.stock_movements sm
group by sm.branch_id, sm.sku_id;

create or replace function public.can_view_inventory()
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
        'warehouse'
      )
      from public.current_profile()
    ),
    false
  );
$$;

create or replace function public.can_view_all_branches_inventory()
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

create or replace function public.can_create_stock_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('warehouse', 'branch_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_approve_stock_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'branch_accountant') from public.current_profile()),
    false
  );
$$;

create or replace function public.assert_branch_access(p_branch_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_branch uuid;
begin
  select role, branch_id into v_role, v_branch from public.current_profile();
  if v_role is null then
    raise exception 'Not authenticated';
  end if;
  if v_role in ('owner', 'general_accountant') then
    return;
  end if;
  if v_branch is distinct from p_branch_id then
    raise exception 'No access to this branch';
  end if;
end;
$$;

-- Stock on hand helper
create or replace function public.stock_on_hand(p_branch_id uuid, p_sku_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)
  from public.stock_movements
  where branch_id = p_branch_id
    and sku_id = p_sku_id;
$$;

-- Post stock in (creates ledger row only)
create or replace function public.post_stock_in(
  p_branch_id uuid,
  p_sku_id uuid,
  p_quantity numeric,
  p_note text default null,
  p_moved_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.can_create_stock_ops() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to post stock in';
  end if;
  if p_quantity <= 0 then
    raise exception 'Stock in quantity must be positive';
  end if;
  perform public.assert_branch_access(p_branch_id);

  insert into public.stock_movements (
    sku_id, branch_id, quantity, movement_type, note, created_by, moved_at, reference_table
  ) values (
    p_sku_id, p_branch_id, p_quantity, 'stock_in', p_note, auth.uid(), coalesce(p_moved_at, now()), 'stock_in'
  )
  returning id into v_id;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(),
    'stock_in',
    'stock_movements',
    v_id,
    jsonb_build_object('branch_id', p_branch_id, 'sku_id', p_sku_id, 'quantity', p_quantity, 'note', p_note)
  );

  return v_id;
end;
$$;

-- Request adjustment (warehouse) or direct approve path for BA/Owner
create or replace function public.request_stock_adjustment(
  p_branch_id uuid,
  p_sku_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role public.app_role;
begin
  if p_quantity = 0 then
    raise exception 'Adjustment quantity cannot be zero';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Reason is required';
  end if;

  select role into v_role from public.current_profile();
  if v_role not in ('warehouse', 'branch_accountant', 'owner') then
    raise exception 'Not allowed to request adjustments';
  end if;
  perform public.assert_branch_access(p_branch_id);

  insert into public.stock_adjustments (
    branch_id, sku_id, quantity, reason, status, requested_by
  ) values (
    p_branch_id, p_sku_id, p_quantity, p_reason,
    case when v_role in ('branch_accountant', 'owner') then 'approved'::public.adjustment_status else 'pending'::public.adjustment_status end,
    auth.uid()
  )
  returning id into v_id;

  if v_role in ('branch_accountant', 'owner') then
    update public.stock_adjustments
    set reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_id;

    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
    ) values (
      p_sku_id, p_branch_id, p_quantity, 'adjustment', 'stock_adjustments', v_id, p_reason, auth.uid()
    );
  end if;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(),
    'adjustment_request',
    'stock_adjustments',
    v_id,
    jsonb_build_object('branch_id', p_branch_id, 'sku_id', p_sku_id, 'quantity', p_quantity, 'reason', p_reason)
  );

  return v_id;
end;
$$;

create or replace function public.review_stock_adjustment(
  p_adjustment_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj public.stock_adjustments;
begin
  if not public.can_approve_stock_ops() then
    raise exception 'Not allowed to approve adjustments';
  end if;

  select * into v_adj from public.stock_adjustments where id = p_adjustment_id for update;
  if not found then
    raise exception 'Adjustment not found';
  end if;
  if v_adj.status <> 'pending' then
    raise exception 'Adjustment is not pending';
  end if;
  perform public.assert_branch_access(v_adj.branch_id);

  if p_approve then
    update public.stock_adjustments
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_review_note
    where id = p_adjustment_id;

    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
    ) values (
      v_adj.sku_id, v_adj.branch_id, v_adj.quantity, 'adjustment', 'stock_adjustments', v_adj.id, v_adj.reason, auth.uid()
    );
  else
    update public.stock_adjustments
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_review_note
    where id = p_adjustment_id;
  end if;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(),
    case when p_approve then 'adjustment_approve' else 'adjustment_reject' end,
    'stock_adjustments',
    p_adjustment_id,
    jsonb_build_object('review_note', p_review_note)
  );
end;
$$;

-- Repacking: posts repack_out for inputs and repack_in for outputs
create or replace function public.post_repacking(
  p_branch_id uuid,
  p_repack_date date,
  p_input_weight_kg numeric,
  p_output_weight_kg numeric,
  p_reason text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_line jsonb;
  v_sku uuid;
  v_dir text;
  v_sacks numeric;
  v_has_in boolean := false;
  v_has_out boolean := false;
begin
  if not public.can_create_stock_ops() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to post repacking';
  end if;
  perform public.assert_branch_access(p_branch_id);

  if p_input_weight_kg < p_output_weight_kg then
    raise exception 'Output weight cannot exceed input weight';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Repacking lines required';
  end if;

  insert into public.repacking (
    branch_id, repack_date, input_weight_kg, output_weight_kg, reason, created_by
  ) values (
    p_branch_id, coalesce(p_repack_date, current_date), p_input_weight_kg, p_output_weight_kg, p_reason, auth.uid()
  )
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := (v_line->>'sku_id')::uuid;
    v_dir := v_line->>'direction';
    v_sacks := (v_line->>'sacks')::numeric;

    if v_dir not in ('in', 'out') or v_sacks is null or v_sacks <= 0 then
      raise exception 'Invalid repacking line';
    end if;

    insert into public.repacking_lines (repacking_id, sku_id, direction, sacks)
    values (v_id, v_sku, v_dir::public.repack_direction, v_sacks);

    if v_dir = 'out' then
      v_has_out := true;
      if public.stock_on_hand(p_branch_id, v_sku) < v_sacks then
        raise exception 'Insufficient stock for repack out';
      end if;
      insert into public.stock_movements (
        sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
      ) values (
        v_sku, p_branch_id, -v_sacks, 'repack_out', 'repacking', v_id, p_reason, auth.uid()
      );
    else
      v_has_in := true;
      insert into public.stock_movements (
        sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
      ) values (
        v_sku, p_branch_id, v_sacks, 'repack_in', 'repacking', v_id, p_reason, auth.uid()
      );
    end if;
  end loop;

  if not v_has_in or not v_has_out then
    raise exception 'Repacking needs at least one input (out) and one output (in) line';
  end if;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(),
    'repack',
    'repacking',
    v_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'input_weight_kg', p_input_weight_kg,
      'output_weight_kg', p_output_weight_kg,
      'weight_lost_kg', p_input_weight_kg - p_output_weight_kg,
      'lines', p_lines
    )
  );

  return v_id;
end;
$$;

create or replace function public.create_transfer(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_line jsonb;
begin
  if not public.can_create_stock_ops() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to create transfers';
  end if;
  if p_from_branch_id = p_to_branch_id then
    raise exception 'From and to branches must differ';
  end if;
  perform public.assert_branch_access(p_from_branch_id);

  insert into public.transfers (from_branch_id, to_branch_id, notes, created_by, status)
  values (p_from_branch_id, p_to_branch_id, p_notes, auth.uid(), 'draft')
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.transfer_lines (transfer_id, sku_id, sacks_sent)
    values (v_id, (v_line->>'sku_id')::uuid, (v_line->>'sacks_sent')::numeric);
  end loop;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (
    auth.uid(), 'transfer_create', 'transfers', v_id,
    jsonb_build_object('from', p_from_branch_id, 'to', p_to_branch_id, 'lines', p_lines)
  );

  return v_id;
end;
$$;

create or replace function public.ship_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tr public.transfers;
  v_line public.transfer_lines;
begin
  if not public.can_create_stock_ops() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to ship transfers';
  end if;

  select * into v_tr from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_tr.status <> 'draft' then raise exception 'Only draft transfers can be shipped'; end if;
  perform public.assert_branch_access(v_tr.from_branch_id);

  for v_line in select * from public.transfer_lines where transfer_id = p_transfer_id
  loop
    if public.stock_on_hand(v_tr.from_branch_id, v_line.sku_id) < v_line.sacks_sent then
      raise exception 'Insufficient stock to ship transfer';
    end if;
    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, created_by
    ) values (
      v_line.sku_id, v_tr.from_branch_id, -v_line.sacks_sent, 'transfer_out', 'transfers', v_tr.id, auth.uid()
    );
  end loop;

  update public.transfers
  set status = 'in_transit', shipped_at = now()
  where id = p_transfer_id;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (auth.uid(), 'transfer_ship', 'transfers', p_transfer_id, jsonb_build_object('status', 'in_transit'));
end;
$$;

create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_received_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tr public.transfers;
  v_line public.transfer_lines;
  v_recv numeric;
  v_item jsonb;
begin
  if not public.can_create_stock_ops() and public.current_role() <> 'owner' then
    raise exception 'Not allowed to receive transfers';
  end if;

  select * into v_tr from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_tr.status <> 'in_transit' then raise exception 'Transfer is not in transit'; end if;
  perform public.assert_branch_access(v_tr.to_branch_id);

  for v_item in select * from jsonb_array_elements(p_received_lines)
  loop
    update public.transfer_lines
    set sacks_received = (v_item->>'sacks_received')::numeric
    where transfer_id = p_transfer_id
      and sku_id = (v_item->>'sku_id')::uuid;
  end loop;

  for v_line in select * from public.transfer_lines where transfer_id = p_transfer_id
  loop
    v_recv := coalesce(v_line.sacks_received, v_line.sacks_sent);
    update public.transfer_lines
    set sacks_received = v_recv
    where id = v_line.id;

    insert into public.stock_movements (
      sku_id, branch_id, quantity, movement_type, reference_table, reference_id, note, created_by
    ) values (
      v_line.sku_id,
      v_tr.to_branch_id,
      v_recv,
      'transfer_in',
      'transfers',
      v_tr.id,
      case
        when v_recv <> v_line.sacks_sent then format('Difference: sent %s received %s', v_line.sacks_sent, v_recv)
        else null
      end,
      auth.uid()
    );
  end loop;

  update public.transfers
  set status = 'received', received_at = now(), received_by = auth.uid()
  where id = p_transfer_id;

  insert into public.audit_log (user_id, action, table_name, record_id, new_value)
  values (auth.uid(), 'transfer_receive', 'transfers', p_transfer_id, jsonb_build_object('lines', p_received_lines));
end;
$$;

alter table public.stock_movements enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.repacking enable row level security;
alter table public.repacking_lines enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_lines enable row level security;

create policy stock_movements_select on public.stock_movements
for select to authenticated
using (
  public.can_view_inventory()
  and (
    public.can_view_all_branches_inventory()
    or branch_id = public.current_branch_id()
  )
);

-- Writes go through security definer RPCs only
create policy stock_movements_no_direct_write on public.stock_movements
for insert to authenticated
with check (false);

create policy stock_adjustments_select on public.stock_adjustments
for select to authenticated
using (
  public.can_view_inventory()
  and (
    public.can_view_all_branches_inventory()
    or branch_id = public.current_branch_id()
  )
);

create policy repacking_select on public.repacking
for select to authenticated
using (
  public.can_view_inventory()
  and (
    public.can_view_all_branches_inventory()
    or branch_id = public.current_branch_id()
  )
);

create policy repacking_lines_select on public.repacking_lines
for select to authenticated
using (
  exists (
    select 1 from public.repacking r
    where r.id = repacking_id
      and public.can_view_inventory()
      and (
        public.can_view_all_branches_inventory()
        or r.branch_id = public.current_branch_id()
      )
  )
);

create policy transfers_select on public.transfers
for select to authenticated
using (
  public.can_view_inventory()
  and (
    public.can_view_all_branches_inventory()
    or from_branch_id = public.current_branch_id()
    or to_branch_id = public.current_branch_id()
  )
);

create policy transfer_lines_select on public.transfer_lines
for select to authenticated
using (
  exists (
    select 1 from public.transfers t
    where t.id = transfer_id
      and public.can_view_inventory()
      and (
        public.can_view_all_branches_inventory()
        or t.from_branch_id = public.current_branch_id()
        or t.to_branch_id = public.current_branch_id()
      )
  )
);

grant select on public.v_stock_on_hand to authenticated;
grant execute on function public.post_stock_in to authenticated;
grant execute on function public.request_stock_adjustment to authenticated;
grant execute on function public.review_stock_adjustment to authenticated;
grant execute on function public.post_repacking to authenticated;
grant execute on function public.create_transfer to authenticated;
grant execute on function public.ship_transfer to authenticated;
grant execute on function public.receive_transfer to authenticated;
grant execute on function public.stock_on_hand to authenticated;
