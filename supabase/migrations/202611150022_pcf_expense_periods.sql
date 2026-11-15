-- PCF expense sheets. Expenses accumulate in an open period ("sheet"). When the
-- fund is replenished/refunded the period is cut: it is stored in expense history
-- and a new open period starts, mirroring the separate sheets of the monitoring
-- workbook (sometimes the fund empties before month-end).

begin;

create table public.pcf_periods (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.pcf_funds (id),
  label text not null,
  start_date date not null,
  end_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  replenishment_id uuid references public.pcf_replenishments (id),
  notes text,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'open' or end_date is not null)
);

create unique index pcf_periods_one_open_idx
  on public.pcf_periods (fund_id)
  where status = 'open';

create trigger pcf_periods_set_updated_at
before update on public.pcf_periods
for each row execute function public.set_updated_at();

alter table public.pcf_vouchers
  add column if not exists period_id uuid references public.pcf_periods (id);

create index if not exists pcf_vouchers_period_idx
  on public.pcf_vouchers (period_id);

alter table public.pcf_periods enable row level security;

create policy pcf_periods_select on public.pcf_periods
for select to authenticated
using (
  public.can_view_pcf()
  and (
    public.current_role() in ('owner', 'general_accountant')
    or fund_id in (
      select id from public.pcf_funds
      where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

create policy pcf_periods_write on public.pcf_periods
for all to authenticated
using (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner', 'general_accountant')
    or fund_id in (
      select id from public.pcf_funds
      where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
)
with check (
  public.can_manage_pcf()
  and (
    public.current_role() in ('owner', 'general_accountant')
    or fund_id in (
      select id from public.pcf_funds
      where branch_id = public.current_branch_id() and deleted_at is null
    )
  )
);

create view public.v_pcf_period_totals
with (security_invoker = true) as
select
  p.id,
  p.fund_id,
  b.name as branch_name,
  p.label,
  p.start_date,
  p.end_date,
  p.status,
  p.replenishment_id,
  p.notes,
  p.closed_by,
  p.closed_at,
  p.created_at,
  p.updated_at,
  count(v.id) filter (where v.deleted_at is null)::int as voucher_count,
  coalesce(sum(v.amount) filter (where v.deleted_at is null), 0) as total
from public.pcf_periods p
join public.pcf_funds f on f.id = p.fund_id
join public.branches b on b.id = f.branch_id
left join public.pcf_vouchers v on v.period_id = p.id
group by p.id, b.name;

grant select on public.v_pcf_period_totals to authenticated;

-- New vouchers join the fund's open period; a period is opened on demand.
create or replace function public.pcf_voucher_assign_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  open_period uuid;
begin
  if new.period_id is not null then
    return new;
  end if;

  select id into open_period
  from public.pcf_periods
  where fund_id = new.fund_id and status = 'open'
  limit 1;

  if open_period is null then
    insert into public.pcf_periods (fund_id, label, start_date)
    values (new.fund_id, upper(to_char(new.voucher_date, 'MON FMDD')), new.voucher_date)
    returning id into open_period;
  end if;

  new.period_id := open_period;
  return new;
end;
$fn$;

drop trigger if exists pcf_voucher_assign_period on public.pcf_vouchers;
create trigger pcf_voucher_assign_period
before insert on public.pcf_vouchers
for each row execute function public.pcf_voucher_assign_period();

-- Cut the open sheet: stamp the end date, store it, and open the next one.
create or replace function public.close_pcf_period(
  p_period_id uuid,
  p_label text default null,
  p_notes text default null
)
returns public.pcf_periods
language plpgsql
security definer
set search_path = public
as $fn$
declare
  period public.pcf_periods;
  last_date date;
  next_start date;
begin
  if not public.can_manage_pcf() then
    raise exception 'Not allowed to close petty cash sheets';
  end if;

  select * into period
  from public.pcf_periods
  where id = p_period_id
  for update;

  if not found then
    raise exception 'Sheet not found';
  end if;
  if period.status <> 'open' then
    raise exception 'This sheet is already closed';
  end if;

  select max(v.voucher_date) into last_date
  from public.pcf_vouchers v
  where v.period_id = period.id
    and v.deleted_at is null;

  next_start := greatest(coalesce(last_date, current_date) + 1, current_date);

  update public.pcf_periods
  set status = 'closed',
      end_date = coalesce(last_date, current_date),
      label = coalesce(nullif(btrim(p_label), ''), label),
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      closed_at = now(),
      closed_by = auth.uid()
  where id = period.id
  returning * into period;

  insert into public.pcf_periods (fund_id, label, start_date)
  values (period.fund_id, upper(to_char(next_start, 'MON FMDD')), next_start);

  return period;
end;
$fn$;

grant execute on function public.close_pcf_period(uuid, text, text) to authenticated;

-- Backfill: one open sheet per fund, covering every existing voucher.
insert into public.pcf_periods (fund_id, label, start_date, status)
select f.id,
       upper(to_char(coalesce(min(v.voucher_date), current_date), 'MON FMDD')),
       coalesce(min(v.voucher_date), current_date),
       'open'
from public.pcf_funds f
left join public.pcf_vouchers v on v.fund_id = f.id and v.deleted_at is null
where f.active
  and f.deleted_at is null
  and not exists (
    select 1 from public.pcf_periods p
    where p.fund_id = f.id and p.status = 'open'
  )
group by f.id;

update public.pcf_vouchers v
set period_id = p.id
from public.pcf_periods p
where v.period_id is null
  and v.fund_id = p.fund_id
  and p.status = 'open';

commit;
