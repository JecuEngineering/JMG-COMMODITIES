-- Complete the Cebu PCF "NOVEMBER 9-" monitoring sheet (11/09–11/19/26) so the
-- system matches the printed sheet:
--   PCF FUNDING ₱50,000.00 − TOTAL EXPENSE ₱48,805.00 = BALANCE ₱1,195.00.
--
-- Migration ...021 already imported the 11/09–11/14 vouchers (PCV-0001..0029,
-- ₱17,339). Comparing that against the sheet left three gaps:
--   1. PCV-0002 transport was under-recorded: ₱1,500 vs ₱1,700 on the sheet.
--   2. PCV-0004 lunch allowance sits in the EMPLOYEE BENEFITS column, not MEALS
--      (verified against every printed column total of the sheet).
--   3. The 11/12 SHIFTING/REPOSITION ₱100 line was missing, and the whole
--      11/16–11/19 block (PCV-0030..PCV-0063, ₱31,166) had not been imported.
--
-- New/corrected vouchers join the same expense sheet as PCV-0001..0029 and the
-- sheet is stretched to its real 11/19 end date. Idempotent: the corrections are
-- value-guarded and the inserts are on conflict do nothing.

begin;

-- 1. PCV-0002 transport under-recorded.
update public.pcf_vouchers v
set amount = 1700
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
where v.fund_id = f.id
  and b.name ilike '%cebu%'
  and f.active
  and f.deleted_at is null
  and v.voucher_no = 'PCV-0002'
  and v.amount = 1500;

-- 2. PCV-0004 lunch allowance belongs to the EMPLOYEE BENEFITS column.
update public.pcf_vouchers v
set category = 'EMPLOYEE BENEFITS'
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
where v.fund_id = f.id
  and b.name ilike '%cebu%'
  and f.active
  and f.deleted_at is null
  and v.voucher_no = 'PCV-0004'
  and v.category = 'MEALS AND INTERTAINMENT';

-- 3. Missing 11/12 line + the 11/16–11/19 vouchers, into the same sheet.
--    The sheet carries one expense above the ₱5,000 petty-cash cap (a single
--    ₱7,500 line), so the cap trigger is paused for the historical import only.
alter table public.pcf_vouchers disable trigger pcf_voucher_limit;

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
sheet as (
  select period_id
  from public.pcf_vouchers
  where fund_id = (select id from fund)
    and voucher_no = 'PCV-0001'
    and period_id is not null
),
rows (voucher_no, voucher_date, payee, category, amount) as (
  values
    ('PCV-0030', date '2026-11-12', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 100::numeric),
    ('PCV-0031', date '2026-11-16', 'TRANSPO BASAK-WAREHOUSE VV. 11/16,17,18,19,20,21', 'TRANSPORTATION/MEALS/TOLLS', 1260::numeric),
    ('PCV-0032', date '2026-11-16', 'LABOR FEE (DISKARGA CHARLES LIM) C/O TE AIDEN', 'DISKARGA', 2000::numeric),
    ('PCV-0033', date '2026-11-16', 'LABOR FEE (DISKARGA SUPERMAMA PAKISTAN 25%) C/O YA NOTS', 'DISKARGA', 2000::numeric),
    ('PCV-0034', date '2026-11-16', 'LABOR FEE (REFILE JAPONICA) C/O YA NOTS', 'MEDICINES AND OTHERS', 1000::numeric),
    ('PCV-0035', date '2026-11-16', 'WATER 17PCS. BOTTLE', 'UTILITIES', 450::numeric),
    ('PCV-0036', date '2026-11-16', 'SOFTDRINKS', 'EMPLOYEE BENEFITS', 327::numeric),
    ('PCV-0037', date '2026-11-16', 'CAKE FOR YA NOTS', 'EMPLOYEE BENEFITS', 601::numeric),
    ('PCV-0038', date '2026-11-16', 'TRANSPO CHARLES LIM-WAREHOUSE (CHRISTIAN)', 'TRANSPORTATION/MEALS/TOLLS', 114::numeric),
    ('PCV-0039', date '2026-11-16', 'WHOLE LETCHON BABOY', 'EMPLOYEE BENEFITS', 7500::numeric),
    ('PCV-0040', date '2026-11-17', 'PARKING FEE (DELIVER TO MERKADO) C/O SAMUEL', 'TRANSPORTATION/MEALS/TOLLS', 100::numeric),
    ('PCV-0041', date '2026-11-17', 'RECEIPTS (DR) FROM MARKET', 'SUPPLIES & JANITORIALS', 160::numeric),
    ('PCV-0042', date '2026-11-17', 'LUNCH ALLOWANCE', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0043', date '2026-11-17', 'BUTANE AND ICE (MORNING) C/O NOTS', 'MEALS AND INTERTAINMENT', 100::numeric),
    ('PCV-0044', date '2026-11-17', 'PARKING FEE (DELIVER TO MERKADO) C/O NOTS', 'TRANSPORTATION/MEALS/TOLLS', 50::numeric),
    ('PCV-0045', date '2026-11-17', 'ICE (AFTERNOON)', 'MEALS AND INTERTAINMENT', 25::numeric),
    ('PCV-0046', date '2026-11-17', 'LABOR FEE (SUPERMAMA 5%) 2 CONTAINERS', 'DISKARGA', 2000::numeric),
    ('PCV-0047', date '2026-11-17', 'REFILE (JAPO)', 'MEDICINES AND OTHERS', 800::numeric),
    ('PCV-0048', date '2026-11-17', 'INTERIOR FOR MOTOR-SMASH', 'REPAIR & MAINTENANCE', 330::numeric),
    ('PCV-0049', date '2026-11-17', 'RECEIPTS (DR) FROM SHOPEE', 'SUPPLIES & JANITORIALS', 211::numeric),
    ('PCV-0050', date '2026-11-17', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 200::numeric),
    ('PCV-0051', date '2026-11-18', 'ICE (MORNING)', 'MEALS AND INTERTAINMENT', 50::numeric),
    ('PCV-0052', date '2026-11-18', 'LUNCH (LETCHON MANOK AND SAGING)', 'MEALS AND INTERTAINMENT', 1358::numeric),
    ('PCV-0053', date '2026-11-18', 'CASH ADVANCE (DISKARGA PAKISTAN 25%)', 'DISKARGA', 700::numeric),
    ('PCV-0054', date '2026-11-18', 'CASH ADVANCE (DISKARGA PAKISTAN 25%)', 'DISKARGA', 300::numeric),
    ('PCV-0055', date '2026-11-18', 'CASH ADVANCE - JEFF', 'AR EMPLOYEE/ CASH OUT', 500::numeric),
    ('PCV-0056', date '2026-11-18', 'CASH ADVANCE - JIOREI', 'AR EMPLOYEE/ CASH OUT', 1000::numeric),
    ('PCV-0057', date '2026-11-18', 'CASH ADVANCE (DISKARGA PAKISTAN 25%)', 'DISKARGA', 1000::numeric),
    ('PCV-0058', date '2026-11-18', 'SNACKS MORNING (BREAD, ICE, NESTEA)', 'MEALS AND INTERTAINMENT', 345::numeric),
    ('PCV-0059', date '2026-11-18', 'CASH ADVANCE - JASON', 'AR EMPLOYEE/ CASH OUT', 50::numeric),
    ('PCV-0060', date '2026-11-18', 'CASH ADVANCE - ELENIEL', 'AR EMPLOYEE/ CASH OUT', 50::numeric),
    ('PCV-0061', date '2026-11-18', 'OFFICE SUPPLY', 'SUPPLIES & JANITORIALS', 735::numeric),
    ('PCV-0062', date '2026-11-19', 'CASH ADVANCE - JIOREI', 'AR EMPLOYEE/ CASH OUT', 5000::numeric),
    ('PCV-0063', date '2026-11-19', 'VULCANIZED TIRE - TRAILER', 'REPAIR & MAINTENANCE', 350::numeric)
)
insert into public.pcf_vouchers (fund_id, voucher_no, voucher_date, payee, category, amount, period_id)
select fund.id, rows.voucher_no, rows.voucher_date, rows.payee, rows.category, rows.amount, sheet.period_id
from rows
cross join fund
left join sheet on true
on conflict (fund_id, voucher_no) do nothing;

alter table public.pcf_vouchers enable trigger pcf_voucher_limit;

-- The sheet now runs to 11/19, not 11/14.
update public.pcf_periods
set end_date = date '2026-11-19'
where id = (
  select period_id
  from public.pcf_vouchers
  where voucher_no = 'PCV-0001'
    and fund_id = (
      select f.id
      from public.pcf_funds f
      join public.branches b on b.id = f.branch_id
      where b.name ilike '%cebu%'
        and f.active
        and f.deleted_at is null
      order by f.created_at
      limit 1
    )
)
and (end_date is null or end_date < date '2026-11-19');

commit;
