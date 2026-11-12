-- Phase 9 – Public website inquiries
-- Table: inquiries (id, name, contact, message, status, branch_interest, created_at)
-- Status: new, read, replied, archived
-- Public can insert; staff can read + update status.

create type public.inquiry_status as enum ('new', 'read', 'replied', 'archived');

create table public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  contact     text not null,       -- phone or email
  message     text not null,
  branch_interest text,            -- optional: which branch / area they are near
  status      public.inquiry_status not null default 'new',
  replied_by  uuid references public.profiles (id),
  replied_at  timestamptz,
  reply_notes text,
  created_at  timestamptz not null default now()
);

alter table public.inquiries enable row level security;

-- Anyone (including anonymous) can submit an inquiry
create policy inquiries_insert on public.inquiries
for insert
with check (true);

-- Authenticated staff can read inquiries
create policy inquiries_select on public.inquiries
for select to authenticated
using (true);

-- Only authenticated staff can update status / reply notes
create policy inquiries_update on public.inquiries
for update to authenticated
using (true)
with check (true);

-- Soft-archive: staff can delete (we use status = archived instead, but keep delete for cleanup)
create policy inquiries_delete on public.inquiries
for delete to authenticated
using (true);

