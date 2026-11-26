-- Import the Cebu PCF "NOVEMBER 19-" monitoring sheet (11/19–11/26/26) into the
-- fund's open expense sheet, and settle the previous cycle.
--
--   Sheet columns: PCF FUNDING ₱100,000.00 − TOTAL EXPENSE ₱85,257.41 = BALANCE ₱14,742.59.
--
-- The new cycle starts with ₱100,000 cash, which is the closed "NOV 9" sheet's
-- ₱48,805 spend replenished on top of the ₱50,000 fund raised to ₱100,000 (see
-- migration ...025). So a carry-over replenishment of ₱48,805 settles the closed
-- sheet; after importing the 11/19–11/26 vouchers the fund balance is
--   100,000 − (48,805 + 85,257.41) + 48,805 = ₱14,742.59,
-- matching the sheet.
--
-- The 11/19–11/26 sheet adds one column the older sheet did not have,
-- REPRESENTATION (the ₱3,000 BPI inspection line). Every printed column total is
-- reproduced exactly. Idempotent: the replenishment is reference-guarded and the
-- vouchers are on conflict do nothing.

begin;

-- 1. Carry-over replenishment settling the closed "NOV 9" sheet (₱48,805).
insert into public.pcf_replenishments (fund_id, replenishment_date, amount, vouchers_covered, reference_no, notes)
select f.id, date '2026-11-19', 48805, 63, 'NOV 9 SHEET',
       'Carry-over replenishment settling the NOV 9 expense sheet (₱48,805).'
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
where b.name ilike '%cebu%'
  and f.active
  and f.deleted_at is null
  and not exists (
    select 1 from public.pcf_replenishments r
    where r.fund_id = f.id and r.reference_no = 'NOV 9 SHEET'
  );

update public.pcf_periods p
set replenishment_id = r.id
from public.pcf_replenishments r
where r.fund_id = p.fund_id
  and r.reference_no = 'NOV 9 SHEET'
  and p.status = 'closed'
  and p.replenishment_id is null;

-- 2. Sheet labels: the closed sheet is the workbook's "NOV 9" tab; the open sheet
--    is the new "NOV 19" tab, starting 11/19.
update public.pcf_periods p
set label = 'NOV 9'
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
where p.fund_id = f.id
  and b.name ilike '%cebu%'
  and p.status = 'closed'
  and p.label = 'NOV 19';

update public.pcf_periods p
set label = 'NOV 19', start_date = date '2026-11-19'
from public.pcf_funds f
join public.branches b on b.id = f.branch_id
where p.fund_id = f.id
  and b.name ilike '%cebu%'
  and p.status = 'open';

-- 3. The 11/19–11/26 vouchers (PCV-0064..PCV-0119). The sheet carries several
--    expenses above the ₱5,000 petty-cash cap, so the cap trigger is paused for
--    the historical import only.
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
rows (voucher_no, voucher_date, payee, category, amount) as (
  values
    ('PCV-0064', date '2026-11-19', 'CASH ADVANCE (ANALOU)', 'AR EMPLOYEE/ CASH OUT', 2000::numeric),
    ('PCV-0065', date '2026-11-19', 'GROCERY (JIOREI)', 'EMPLOYEE BENEFITS', 5202::numeric),
    ('PCV-0066', date '2026-11-19', 'C.A. CV# MRKU90307223, SUDU1986735, MRKU9320098', 'DISKARGA', 6940::numeric),
    ('PCV-0067', date '2026-11-19', 'REFILING (CAMEL 50KG & SUPERMAMA P 25%)', 'DISKARGA', 2125::numeric),
    ('PCV-0068', date '2026-11-20', 'LUNCH', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0069', date '2026-11-20', 'FARE FLOWERS AND GROCERIES TO BORBON', 'TRANSPORTATION/MEALS/TOLLS', 670::numeric),
    ('PCV-0070', date '2026-11-20', 'BUTANE AND WATER BOTTLE', 'MEALS AND INTERTAINMENT', 95::numeric),
    ('PCV-0071', date '2026-11-20', 'DINNER C/O BOSS', 'MEALS AND INTERTAINMENT', 1692::numeric),
    ('PCV-0072', date '2026-11-20', 'DISKARGA SUPERMAMA 5%', 'DISKARGA', 2000::numeric),
    ('PCV-0073', date '2026-11-20', 'GARBAGE COLECTION', 'UTILITIES', 500::numeric),
    ('PCV-0074', date '2026-11-20', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 150::numeric),
    ('PCV-0075', date '2026-11-20', 'CV#MAGU2282422', 'CONTAINER CHARGES', 2000::numeric),
    ('PCV-0076', date '2026-11-20', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 200::numeric),
    ('PCV-0077', date '2026-11-20', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 100::numeric),
    ('PCV-0078', date '2026-11-21', 'CASH ADVANCE (JUVY)', 'DISKARGA', 1100::numeric),
    ('PCV-0079', date '2026-11-21', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 200::numeric),
    ('PCV-0080', date '2026-11-21', 'CASH ADVANCE (JUVY)', 'DISKARGA', 800::numeric),
    ('PCV-0081', date '2026-11-21', 'CASH ADVANCE (JUVY)', 'CONTAINER CHARGES', 2000::numeric),
    ('PCV-0082', date '2026-11-21', 'BPI INSPECTION', 'REPRESENTATION', 3000::numeric),
    ('PCV-0083', date '2026-11-21', 'CASH ADVANCE (CHRISTIAN)', 'AR EMPLOYEE/ CASH OUT', 200::numeric),
    ('PCV-0084', date '2026-11-22', 'FULL PAYMENT (JUVY)', 'DISKARGA', 7590::numeric),
    ('PCV-0085', date '2026-11-23', 'TRANSPO WAREHOUSE TO BASAK VV. 11/23,24,25', 'TRANSPORTATION/MEALS/TOLLS', 560::numeric),
    ('PCV-0086', date '2026-11-23', 'CASH ADVANCE (JUVY)', 'DISKARGA', 2000::numeric),
    ('PCV-0087', date '2026-11-23', 'UTINSILS & DRINKS', 'MEALS AND INTERTAINMENT', 348.50::numeric),
    ('PCV-0088', date '2026-11-23', 'POLYSTER THREAD 30PCS.', 'SUPPLIES & JANITORIALS', 1770::numeric),
    ('PCV-0089', date '2026-11-23', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 100::numeric),
    ('PCV-0090', date '2026-11-23', 'CASH ADVANCE (JEFF)', 'AR EMPLOYEE/ CASH OUT', 2000::numeric),
    ('PCV-0091', date '2026-11-23', '10PCS ICE', 'MEALS AND INTERTAINMENT', 50::numeric),
    ('PCV-0092', date '2026-11-23', 'GASOLINE FOR MOTOR-SMASH', 'GAS & OIL', 284.19::numeric),
    ('PCV-0093', date '2026-11-23', 'LECHON MANOK & LIEMPO', 'MEALS AND INTERTAINMENT', 1600::numeric),
    ('PCV-0094', date '2026-11-24', 'DISKARGA AND REFILING', 'DISKARGA', 5882::numeric),
    ('PCV-0095', date '2026-11-24', 'MARINE FLYWOOD', 'REPAIR & MAINTENANCE', 1350::numeric),
    ('PCV-0096', date '2026-11-24', 'GASOLINE FOR MOTOR-NMAX', 'GAS & OIL', 394.45::numeric),
    ('PCV-0097', date '2026-11-24', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 500::numeric),
    ('PCV-0098', date '2026-11-24', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 400::numeric),
    ('PCV-0099', date '2026-11-24', 'CASH ADVANCE JUVY', 'DISKARGA', 1000::numeric),
    ('PCV-0100', date '2026-11-24', 'FULL PAYMENT (JUVY)', 'DISKARGA', 5350::numeric),
    ('PCV-0101', date '2026-11-24', 'CASH ADVANCE (JEFF)', 'AR EMPLOYEE/ CASH OUT', 100::numeric),
    ('PCV-0102', date '2026-11-25', 'LUNCH', 'MEALS AND INTERTAINMENT', 500::numeric),
    ('PCV-0103', date '2026-11-25', 'ICE (AFTERNOON)', 'MEALS AND INTERTAINMENT', 50::numeric),
    ('PCV-0104', date '2026-11-25', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 800::numeric),
    ('PCV-0105', date '2026-11-25', 'ASSORTED BREAD', 'MEALS AND INTERTAINMENT', 456::numeric),
    ('PCV-0106', date '2026-11-25', 'NESTEA 10PCS.', 'MEALS AND INTERTAINMENT', 250::numeric),
    ('PCV-0107', date '2026-11-25', 'BUTANE AND OIL', 'MEALS AND INTERTAINMENT', 200::numeric),
    ('PCV-0108', date '2026-11-25', 'JUVY', 'DISKARGA', 4450::numeric),
    ('PCV-0109', date '2026-11-25', 'EMERGENCY FUND', 'EMPLOYEE BENEFITS', 3000::numeric),
    ('PCV-0110', date '2026-11-25', 'SWELDO (TO REFUND)', 'EMPLOYEE BENEFITS', 2218::numeric),
    ('PCV-0111', date '2026-11-25', 'CASH ADVANCE (BRO)', 'AR EMPLOYEE/ CASH OUT', 500::numeric),
    ('PCV-0112', date '2026-11-25', '20 GAL. OF WATER', 'UTILITIES', 500::numeric),
    ('PCV-0113', date '2026-11-26', 'SHIFTING/REPOSITION', 'CONTAINER CHARGES', 200::numeric),
    ('PCV-0114', date '2026-11-26', 'LUNCH', 'MEALS AND INTERTAINMENT', 2080::numeric),
    ('PCV-0115', date '2026-11-26', 'ELECTRIC BILL', 'UTILITIES', 5626.27::numeric),
    ('PCV-0116', date '2026-11-26', '5PCS. ICE', 'MEALS AND INTERTAINMENT', 50::numeric),
    ('PCV-0117', date '2026-11-26', 'BUTANE', 'MEALS AND INTERTAINMENT', 90::numeric),
    ('PCV-0118', date '2026-11-26', 'FLAME GUN', 'SUPPLIES & JANITORIALS', 534::numeric),
    ('PCV-0119', date '2026-11-26', 'CA JUVY', 'DISKARGA', 1000::numeric)
)
insert into public.pcf_vouchers (fund_id, voucher_no, voucher_date, payee, category, amount)
select fund.id, rows.voucher_no, rows.voucher_date, rows.payee, rows.category, rows.amount
from rows
cross join fund
on conflict (fund_id, voucher_no) do nothing;

alter table public.pcf_vouchers enable trigger pcf_voucher_limit;

commit;
