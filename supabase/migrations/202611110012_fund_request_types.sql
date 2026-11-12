-- Fund request types: cash advance (laborers/employees), reimbursement, purchase, other
alter table public.fund_requests
add column if not exists request_type text not null default 'cash_advance';

alter table public.fund_requests
drop constraint if exists fund_requests_request_type_check;

alter table public.fund_requests
add constraint fund_requests_request_type_check
check (request_type in ('cash_advance', 'reimbursement', 'purchase', 'other'));
