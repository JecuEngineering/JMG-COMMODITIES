-- 016: official company details for the public site and printed documents
--
-- Apply in Supabase SQL Editor (or `supabase db push`). Safe to re-run.
-- Only placeholder values are replaced; anything already edited in Settings stays as is.

update public.company_settings
set address = case
      when btrim(coalesce(address, '')) in ('', 'Philippines') then
        'Unit 4, AMari Building / Mendi Complex, Purok 4, Brgy. Mining, Angeles City, Pampanga'
      else address
    end,
    contacts = case
      when btrim(coalesce(contacts, '')) in ('', 'info@jmgcommodities.ph') then
        '+63 932 305 3491 (Phone / Viber)'
      else contacts
    end,
    updated_at = now()
where id = (select id from public.company_settings order by updated_at limit 1);

-- Repair the two seeded placeholder branches in place…
update public.branches
set name = 'Angeles City · Main Office & Branch',
    address = 'Unit 4, AMari Building / Mendi Complex, Purok 4, Brgy. Mining, Angeles City, Pampanga',
    contact = '+63 932 305 3491 (Phone / Viber)'
where id = '11111111-1111-1111-1111-111111111111';

update public.branches
set name = 'Cebu · Branch & Warehouse',
    address = 'Tipolo, Mandaue City, Cebu',
    contact = '+63 932 305 3491 (Phone / Viber)'
where id = '22222222-2222-2222-2222-222222222222';

-- …and add any official location that is still missing.
insert into public.branches (name, address, contact, active)
select 'Angeles City · Main Office & Branch',
       'Unit 4, AMari Building / Mendi Complex, Purok 4, Brgy. Mining, Angeles City, Pampanga',
       '+63 932 305 3491 (Phone / Viber)',
       true
where not exists (
  select 1 from public.branches
  where deleted_at is null
    and (name ilike '%angeles%' or address ilike '%angeles%')
);

insert into public.branches (name, address, contact, active)
select 'Cebu · Branch & Warehouse', 'Tipolo, Mandaue City, Cebu', '+63 932 305 3491 (Phone / Viber)', true
where not exists (
  select 1 from public.branches
  where deleted_at is null
    and (name ilike '%cebu%' or address ilike '%cebu%' or address ilike '%mandaue%')
);

insert into public.branches (name, address, contact, active)
select 'Bohol · Branch & Warehouse', 'Tagbilaran, Bohol', '+63 932 305 3491 (Phone / Viber)', true
where not exists (
  select 1 from public.branches
  where deleted_at is null
    and (name ilike '%bohol%' or address ilike '%bohol%' or address ilike '%tagbilaran%')
);
