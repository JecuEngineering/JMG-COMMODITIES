-- Phase 8 – Fund requests
-- Flow: Employee/Warehouse -> Branch Accountant -> Owner -> General Accountant (release) -> Liquidation
-- Statuses: draft, submitted, forwarded, approved, released, liquidated, rejected
-- A request cannot skip a step (enforced by trigger).

create type public.fund_request_status as enum (
  'draft',
  'submitted',
  'forwarded',
  'approved',
  'released',
  'liquidated',
  'rejected'
);

create type public.fund_request_action as enum (
  'created',
  'submitted',
  'forwarded',
  'approved',
  'rejected',
  'released',
  'liquidated'
);

create type public.release_method as enum ('online_transfer', 'check');

create table public.fund_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  purpose text not null,
  category text,
  amount numeric(14, 2) not null check (amount > 0),
  status public.fund_request_status not null default 'draft',
  attachments text[],
  notes text,
  -- release fields (filled by GA)
  release_method public.release_method,
  release_reference text,
  release_bank text,
  released_by uuid references public.profiles (id),
  released_at timestamptz,
  -- liquidation fields (filled by requester or BA)
  actual_spent numeric(14, 2),
  returned_amount numeric(14, 2) default 0,
  liquidation_notes text,
  liquidated_by uuid references public.profiles (id),
  liquidated_at timestamptz,
  -- rejection
  rejected_by uuid references public.profiles (id),
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger fund_requests_set_updated_at
before update on public.fund_requests
for each row execute function public.set_updated_at();

create table public.fund_request_steps (
  id uuid primary key default gen_random_uuid(),
  fund_request_id uuid not null references public.fund_requests (id) on delete cascade,
  action public.fund_request_action not null,
  actor_id uuid not null references public.profiles (id),
  reason text,
  release_method public.release_method,
  release_reference text,
  release_bank text,
  created_at timestamptz not null default now()
);

create table public.liquidation_receipts (
  id uuid primary key default gen_random_uuid(),
  fund_request_id uuid not null references public.fund_requests (id) on delete cascade,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  receipt_path text,
  created_at timestamptz not null default now()
);

-- Enforce valid status transitions (cannot skip a step)
create or replace function public.validate_fund_request_transition()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  valid boolean := false;
  v_role public.app_role := public.current_role();
begin
  -- allow deletion (soft) without status change checks
  if new.deleted_at is not null then
    return new;
  end if;

  -- on insert, status must be draft (the default)
  if tg_op = 'INSERT' then
    if new.status = 'draft' then
      return new;
    else
      raise exception 'New fund request must start as draft';
    end if;
  end if;

  -- no status change is fine (e.g. editing notes)
  if old.status = new.status then
    return new;
  end if;

  -- cannot move out of terminal states
  if old.status in ('liquidated', 'rejected') then
    raise exception 'Cannot change status of a % request', old.status;
  end if;

  -- valid transitions
  if old.status = 'draft' and new.status = 'submitted' then valid := true; end if;
  if old.status = 'submitted' and new.status = 'forwarded' then valid := true; end if;
  if old.status = 'submitted' and new.status = 'rejected' then valid := true; end if;
  if old.status = 'forwarded' and new.status = 'approved' then valid := true; end if;
  if old.status = 'forwarded' and new.status = 'rejected' then valid := true; end if;
  if old.status = 'approved' and new.status = 'released' then valid := true; end if;
  if old.status = 'released' and new.status = 'liquidated' then valid := true; end if;

  if not valid then
    raise exception 'Invalid status transition: % -> %', old.status, new.status;
  end if;

  -- Who may perform each transition (System Admin may do everything)
  if v_role is distinct from 'system_admin' then
    if old.status = 'draft' and new.status = 'submitted' then
      if new.requester_id <> auth.uid() then
        raise exception 'Only the requester can submit this fund request';
      end if;
    elsif old.status = 'submitted' and new.status in ('forwarded', 'rejected') then
      if v_role is distinct from 'branch_accountant' then
        raise exception 'Only the Branch Accountant can forward or reject this request';
      end if;
    elsif old.status = 'forwarded' and new.status in ('approved', 'rejected') then
      if v_role is distinct from 'owner' then
        raise exception 'Only the Owner can approve or reject this request';
      end if;
    elsif old.status = 'approved' and new.status = 'released' then
      if v_role is distinct from 'general_accountant' then
        raise exception 'Only the General Accountant can release funds';
      end if;
    elsif old.status = 'released' and new.status = 'liquidated' then
      if v_role not in ('employee', 'warehouse', 'branch_accountant', 'owner', 'general_accountant') then
        raise exception 'You cannot liquidate this request';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger fund_requests_validate_transition
before update on public.fund_requests
for each row execute function public.validate_fund_request_transition();

-- Auto-record a step whenever the status changes
create or replace function public.record_fund_request_step()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  step_action public.fund_request_action;
begin
  if tg_op = 'INSERT' then
    insert into public.fund_request_steps (fund_request_id, action, actor_id)
    values (new.id, 'created', new.requester_id);
    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  step_action := case new.status
    when 'submitted' then 'submitted'
    when 'forwarded' then 'forwarded'
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'released' then 'released'
    when 'liquidated' then 'liquidated'
    else null
  end;

  if step_action is not null then
    insert into public.fund_request_steps (
      fund_request_id, action, actor_id, reason,
      release_method, release_reference, release_bank
    )
    values (
      new.id, step_action,
      coalesce(new.rejected_by, new.released_by, new.liquidated_by, auth.uid()),
      new.rejection_reason,
      new.release_method, new.release_reference, new.release_bank
    );
  end if;

  return new;
end;
$$;

create trigger fund_requests_record_step
after update on public.fund_requests
for each row execute function public.record_fund_request_step();

create trigger fund_requests_record_step_insert
after insert on public.fund_requests
for each row execute function public.record_fund_request_step();

-- RLS roles
create or replace function public.can_create_fund_request()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('employee','warehouse') from public.current_profile()),
    false
  );
$$;

create or replace function public.can_review_fund_request()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'branch_accountant' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_approve_fund_request()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'owner' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_release_fund_request()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'general_accountant' from public.current_profile()),
    false
  );
$$;

create or replace function public.can_liquidate_fund_request()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('employee','warehouse','branch_accountant','owner','general_accountant') from public.current_profile()),
    false
  );
$$;

alter table public.fund_requests enable row level security;
alter table public.fund_request_steps enable row level security;
alter table public.liquidation_receipts enable row level security;

-- fund_requests: everyone with any finance role can view; requester always sees own
create policy fund_requests_select on public.fund_requests
for select to authenticated
using (
  deleted_at is null
  and (
    requester_id = auth.uid()
    or public.current_role() in ('owner','general_accountant','branch_accountant')
  )
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
);

create policy fund_requests_insert on public.fund_requests
for insert to authenticated
with check (
  public.can_create_fund_request()
  and requester_id = auth.uid()
  and branch_id = public.current_branch_id()
  and status = 'draft'
);

create policy fund_requests_update on public.fund_requests
for update to authenticated
using (
  deleted_at is null
  and (
    requester_id = auth.uid()
    or public.current_role() in ('owner','general_accountant','branch_accountant')
  )
  and (
    public.current_role() in ('owner','general_accountant')
    or branch_id = public.current_branch_id()
  )
)
with check (
  deleted_at is null
  and (
    requester_id = auth.uid()
    or public.current_role() in ('owner', 'general_accountant', 'branch_accountant')
    or public.is_system_admin()
  )
  and (
    public.current_role() in ('owner', 'general_accountant')
    or public.is_system_admin()
    or branch_id = public.current_branch_id()
  )
);
-- Status changes are validated (transition + actor role) by the
-- fund_requests_validate_transition trigger above.

-- steps and receipts: read-only via the request policies; insert only via trigger steps
create policy fund_request_steps_select on public.fund_request_steps
for select to authenticated
using (
  exists (
    select 1 from public.fund_requests fr
    where fr.id = fund_request_steps.fund_request_id
      and fr.deleted_at is null
      and (
        fr.requester_id = auth.uid()
        or public.current_role() in ('owner','general_accountant','branch_accountant')
      )
  )
);

create policy liquidation_receipts_select on public.liquidation_receipts
for select to authenticated
using (
  exists (
    select 1 from public.fund_requests fr
    where fr.id = liquidation_receipts.fund_request_id
      and fr.deleted_at is null
      and (
        fr.requester_id = auth.uid()
        or public.current_role() in ('owner','general_accountant','branch_accountant')
      )
  )
);

create policy liquidation_receipts_write on public.liquidation_receipts
for all to authenticated
using (
  exists (
    select 1 from public.fund_requests fr
    where fr.id = liquidation_receipts.fund_request_id
      and fr.deleted_at is null
      and fr.status = 'released'
      and (fr.requester_id = auth.uid() or public.current_role() in ('branch_accountant','owner','general_accountant'))
  )
)
with check (
  exists (
    select 1 from public.fund_requests fr
    where fr.id = liquidation_receipts.fund_request_id
      and fr.deleted_at is null
      and fr.status = 'released'
      and (fr.requester_id = auth.uid() or public.current_role() in ('branch_accountant','owner','general_accountant'))
  )
);

-- Storage bucket for fund request attachments / liquidation receipts
insert into storage.buckets (id, name, public)
values ('fund-request-attachments', 'fund-request-attachments', false)
on conflict (id) do nothing;

create policy fund_attachments_read on storage.objects
for select to authenticated
using (
  bucket_id = 'fund-request-attachments'
  and (
    public.current_role() in ('owner','general_accountant','branch_accountant')
    or exists (
      select 1 from public.fund_requests fr
      where fr.requester_id = auth.uid()
        and fr.deleted_at is null
    )
  )
);

create policy fund_attachments_write on storage.objects
for all to authenticated
using (bucket_id = 'fund-request-attachments' and auth.uid() is not null)
with check (bucket_id = 'fund-request-attachments' and auth.uid() is not null);
