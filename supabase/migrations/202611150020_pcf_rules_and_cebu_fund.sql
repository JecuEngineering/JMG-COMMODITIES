-- Petty cash is for everyday small expenses. The Cebu fund is ₱50,000, a
-- single voucher may not exceed ₱5,000, and voucher receipts can be attached
-- to a liquidation line so the released fund can be balanced against them.

begin;

update public.pcf_funds f
set fund_amount = 50000,
    updated_at = now()
from public.branches b
where b.id = f.branch_id
  and b.name ilike '%cebu%'
  and f.deleted_at is null;

create or replace function public.pcf_voucher_limit()
returns trigger
language plpgsql
as $fn$
begin
  if new.amount > 5000 then
    raise exception 'Petty cash vouchers are limited to 5,000. Use Fund Requests for larger expenses.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists pcf_voucher_limit on public.pcf_vouchers;
create trigger pcf_voucher_limit
before insert or update of amount on public.pcf_vouchers
for each row execute function public.pcf_voucher_limit();

alter table public.liquidation_items
  add column if not exists pcf_voucher_id uuid references public.pcf_vouchers(id) on delete set null;

create unique index if not exists liquidation_items_pcf_voucher_uidx
  on public.liquidation_items(pcf_voucher_id)
  where pcf_voucher_id is not null;

-- Branch accountants prepare the replenishment request from the PCF report.
create or replace function public.can_create_fund_request()
returns boolean
language sql
stable security definer
set search_path = public
as $function$
  select coalesce(
    (select role = 'system_admin' or role in ('employee', 'warehouse', 'branch_accountant')
     from public.current_profile()),
    false
  );
$function$;

commit;
