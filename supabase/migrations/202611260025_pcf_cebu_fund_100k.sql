-- The Cebu petty cash fund is raised from ₱50,000 to ₱100,000. The "NOVEMBER 19-"
-- monitoring sheet shows PCF FUNDING ₱100,000.00 for the new cycle, so the fund
-- size is doubled. Idempotent: only moves the fund that is still at ₱50,000.

begin;

update public.pcf_funds f
set fund_amount = 100000
from public.branches b
where f.branch_id = b.id
  and b.name ilike '%cebu%'
  and f.active
  and f.deleted_at is null
  and f.fund_amount = 50000;

commit;
