# JMG Commodities System

Web system for JMG Commodities Inc. (Philippine rice supplier & importer).

**Stack:** React + TypeScript + Vite · Supabase · Netlify (later) · Responsive PWA

## Current progress

- **Phase 1 – Foundation:** auth, role-aware shell, employees, company settings + logo
- **Phase 2 – Products & prices:** varieties, SKUs (5/25/50kg), dated price list
- **Phase 3 – Inventory:** stock ledger, stock in, adjustments, stock card, low stock, repack, transfers

See [CHANGELOG.md](./CHANGELOG.md) for test steps per phase.

## Setup

1. **Node 20+**
2. Create a [Supabase](https://supabase.com) project
3. Copy env file:

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

4. In Supabase SQL editor (or CLI), run migrations in order:

- `supabase/migrations/202611100001_phase1_foundation.sql`
- `supabase/migrations/202611100002_phase2_products_prices.sql`
- `supabase/migrations/202611100003_phase3_inventory.sql`
- `supabase/seed.sql` (optional sample data)

5. Create your first Auth user in Supabase Dashboard → Authentication, then set their profile role:

```sql
update public.profiles
set role = 'system_admin', full_name = 'System Admin'
where email = 'your@email.com';
```

6. (Optional) Deploy employee creator:

```bash
supabase functions deploy create-employee
```

7. Install and run:

```bash
npm install
npm run dev
```

## Roles

Owner · General Accountant · Branch Accountant · Cashier · Warehouse · Employee · System Admin

Menus are filtered by role. Branch-scoped RLS is enforced in Postgres.

## Design tokens

- Background `#F6F3EC`
- Accent jade `#1F6B58`
- Cards: white, 16px radius, `#E7E2D6` border
- Inter (body) · Space Grotesk (headings)
