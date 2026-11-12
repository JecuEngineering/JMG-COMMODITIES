-- Seed data for local / pilot testing.
-- Create auth users in Supabase Auth first (or via Dashboard), then map their UUIDs below.
-- Or run after creating users with the create-employee edge function.

insert into public.branches (id, name, address, contact, active)
values
  ('11111111-1111-1111-1111-111111111111', 'Main branch', 'Metro Manila', '0917-000-0001', true),
  ('22222222-2222-2222-2222-222222222222', 'Cebu branch', 'Cebu City', '0917-000-0002', true)
on conflict (id) do nothing;

update public.company_settings
set
  name = 'JMG Commodities Inc.',
  address = 'Philippines',
  tin = '000-000-000-000',
  contacts = 'info@jmgcommodities.ph',
  dr_prefix = 'DR-MAIN'
where id = (select id from public.company_settings order by updated_at limit 1);

-- Phase 2 sample varieties + SKUs + prices
insert into public.varieties (id, name, origin, active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kasikas Jasmine', 'imported', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Japonica', 'imported', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'White', 'local', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Parboiled', 'imported', true),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Glutinous', 'local', true)
on conflict (name) do nothing;

insert into public.skus (variety_id, sack_size, barcode, active)
select v.id, s.sack_size, upper(left(v.name, 3)) || '-' || s.sack_size || 'KG', true
from public.varieties v
cross join (values (5), (25), (50)) as s(sack_size)
on conflict (variety_id, sack_size) do nothing;

insert into public.prices (sku_id, price, effective_from)
select
  sk.id,
  case sk.sack_size
    when 5 then 320.00
    when 25 then 1450.00
    when 50 then 2800.00
  end,
  current_date - 30
from public.skus sk
where not exists (
  select 1 from public.prices p where p.sku_id = sk.id
);

-- Phase 3: sample opening stock via ledger (Main branch)
-- Requires migration 202611100003. Safe to re-run: skips if stock_in already exists.
insert into public.stock_movements (sku_id, branch_id, quantity, movement_type, note, reference_table)
select
  sk.id,
  '11111111-1111-1111-1111-111111111111',
  case sk.sack_size
    when 5 then 80
    when 25 then 200
    when 50 then 120
  end,
  'stock_in',
  'Opening stock (seed)',
  'seed'
from public.skus sk
where not exists (
  select 1
  from public.stock_movements sm
  where sm.sku_id = sk.id
    and sm.branch_id = '11111111-1111-1111-1111-111111111111'
    and sm.movement_type = 'stock_in'
    and sm.reference_table = 'seed'
);

-- Lower reorder level on a couple SKUs so low-stock alerts show after depleting
update public.skus
set reorder_level = 100
where reorder_level is null or reorder_level = 100;
