-- 013: public website settings, public branch directory, inquiry guardrails
--
-- Apply in Supabase SQL Editor (or `supabase db push`). Safe to re-run.

-- 1. Owner/Admin switch: show or hide prices on the public website
alter table public.company_settings
  add column if not exists show_public_prices boolean not null default true;

-- 2. Public branch directory (anon can read name/address/contact only)
create or replace function public.public_branches()
returns table (id uuid, name text, address text, contact text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.name, b.address, b.contact
  from public.branches b
  where b.deleted_at is null
    and b.active = true
  order by b.name;
$$;

revoke all on function public.public_branches() from public;
grant execute on function public.public_branches() to anon, authenticated;

-- 3. Server-side validation for inquiries (the public form writes with the anon key)
-- NOT VALID: existing rows are not re-checked, so short test messages cannot fail the migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inquiries_name_len') then
    alter table public.inquiries
      add constraint inquiries_name_len check (char_length(btrim(name)) between 2 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inquiries_contact_len') then
    alter table public.inquiries
      add constraint inquiries_contact_len check (char_length(btrim(contact)) between 5 and 160) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inquiries_message_len') then
    alter table public.inquiries
      add constraint inquiries_message_len check (char_length(btrim(message)) between 10 and 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inquiries_branch_len') then
    alter table public.inquiries
      add constraint inquiries_branch_len check (branch_interest is null or char_length(btrim(branch_interest)) <= 120) not valid;
  end if;
end $$;

-- 4. One inquiry per contact per minute, enforced in the database
create or replace function public.enforce_inquiry_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.inquiries i
    where lower(btrim(i.contact)) = lower(btrim(new.contact))
      and i.created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait a minute before sending another inquiry.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_inquiry_cooldown() from public;

drop trigger if exists inquiries_cooldown on public.inquiries;
create trigger inquiries_cooldown
before insert on public.inquiries
for each row execute function public.enforce_inquiry_cooldown();
