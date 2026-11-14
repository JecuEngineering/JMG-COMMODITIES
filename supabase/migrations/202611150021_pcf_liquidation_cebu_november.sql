-- PCF liquidation report support + November 9–14 Cebu data.
--
-- 1. Stable voucher numbers (PCV-0001 ...) so the liquidation report, print-out
--    and Excel export always show the same reference for a voucher.
-- 2. Import the "NOVEMBER 9-" sheet of PETTYCASH MONITORING 2026 CEBU PCF.xlsx
--    into the Cebu fund: 29 vouchers, ₱17,339. Idempotent on (fund_id, voucher_no).

begin;

alter table public.pcf_vouchers
  add column if not exists voucher_no text;

create unique index if not exists pcf_vouchers_fund_no_uidx
  on public.pcf_vouchers (fund_id, voucher_no);

create or replace function public.pcf_voucher_assign_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  next_no integer;
begin
  if new.voucher_no is not null and btrim(new.voucher_no) <> '' then
    return new;
  end if;
  select coalesce(max(substring(voucher_no from '([0-9]+)$')::int), 0) + 1
    into next_no
  from public.pcf_vouchers
  where fund_id = new.fund_id
    and voucher_no ~ '[0-9]+$';
  new.voucher_no := 'PCV-' || lpad(next_no::text, 4, '0');
  return new;
end;
$fn$;

drop trigger if exists pcf_voucher_assign_no on public.pcf_vouchers;
create trigger pcf_voucher_assign_no
before insert on public.pcf_vouchers
for each row execute function public.pcf_voucher_assign_no();

-- Number vouchers logged before this migration (none in practice).
with numbered as (
  select v.id,
         row_number() over (partition by v.fund_id order by v.voucher_date, v.created_at, v.id) as rn,
         (
           select count(*)
           from public.pcf_vouchers x
           where x.fund_id = v.fund_id
             and x.voucher_no is not null
         ) as offset
  from public.pcf_vouchers v
  where v.voucher_no is null
)
update public.pcf_vouchers v
set voucher_no = 'PCV-' || lpad((numbered.rn + numbered.offset)::text, 4, '0')
from numbered
where v.id = numbered.id;

with fund as (
  select f.id
  from public.pcf_funds f
  join public.branches b on b.id = f.branch_id
  where b.name ilike '%cebu%'
    and f.active
    and f.deleted_at is null
  order by f.created_at
  limit 1
),
sheet (voucher_no, voucher_date, description, category, amount) as (
  values
    ('PCV-0001', date '2026-11-09', 'CASH ADVANCE (JOVY)', 'DISKARGA', 3000::numeric),
    ('PCV-0002', date '2026-11-09', 'TRANSPO BASAK-WAREHOUSE VV. 11/09,', 'TRANSPORTATION/MEALS/TOLLS', 1500::numeric),
    ('PCV-0003', date '2026-11-11', 'CA KUYA JEFF', 'AR EMPLOYEE/ CASH OUT', 500::numeric),
    ('PCV-0004', date '2026-11-11', 'LUNCH ALLOWANCE', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0005', date '2026-11-11', 'BPI INSPECTION', 'CONTAINER CHARGES', 1000::numeric),
    ('PCV-0006', date '2026-11-11', 'RECEIPTS (BIR)', 'TAXES & LICENSES', 2500::numeric),
    ('PCV-0007', date '2026-11-11', 'ICE', 'MEALS AND INTERTAINMENT', 50::numeric),
    ('PCV-0008', date '2026-11-11', 'BUTANE', 'MEALS AND INTERTAINMENT', 45::numeric),
    ('PCV-0009', date '2026-11-12', 'DAMYO', 'SUPPLIES & JANITORIALS', 264::numeric),
    ('PCV-0010', date '2026-11-12', 'DINNER', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0011', date '2026-11-12', 'GARBAGE COLLECTION', 'REPAIR & MAINTENANCE', 500::numeric),
    ('PCV-0012', date '2026-11-12', 'WATER', 'UTILITIES', 200::numeric),
    ('PCV-0013', date '2026-11-12', 'LUNCH ALLOWANCE', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0014', date '2026-11-12', 'BUTANE AND MAGIC SARAP', 'MEALS AND INTERTAINMENT', 51::numeric),
    ('PCV-0015', date '2026-11-12', 'BANK CHARGE', 'Bank Charges', 54::numeric),
    ('PCV-0016', date '2026-11-13', 'LUNCH ALLOWANCE', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0017', date '2026-11-13', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 300::numeric),
    ('PCV-0018', date '2026-11-13', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 700::numeric),
    ('PCV-0019', date '2026-11-13', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 100::numeric),
    ('PCV-0020', date '2026-11-13', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 300::numeric),
    ('PCV-0021', date '2026-11-13', 'BREAKFAST', 'MEALS AND INTERTAINMENT', 1845::numeric),
    ('PCV-0022', date '2026-11-13', 'DINNER', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0023', date '2026-11-13', 'GASOLINE FOR MOTOR-NMAX', 'GAS & OIL', 400::numeric),
    ('PCV-0024', date '2026-11-13', 'MIKO', 'CONTAINER CHARGES', 150::numeric),
    ('PCV-0025', date '2026-11-14', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 500::numeric),
    ('PCV-0026', date '2026-11-14', 'LUNCH ALLOWANCE', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0027', date '2026-11-14', 'DUPLICATE KEY', 'REPAIR & MAINTENANCE', 315::numeric),
    ('PCV-0028', date '2026-11-14', 'PARKING FEE', 'TRANSPORTATION/MEALS/TOLLS', 15::numeric),
    ('PCV-0029', date '2026-11-14', 'WATER (MA''AM ROSE)', 'UTILITIES', 50::numeric)
)
insert into public.pcf_vouchers (fund_id, voucher_no, voucher_date, payee, category, amount)
select fund.id, sheet.voucher_no, sheet.voucher_date, sheet.description, sheet.category, sheet.amount
from sheet cross join fund
on conflict (fund_id, voucher_no) do nothing;

commit;
