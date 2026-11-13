# JMG System – Agent Handoff

**Last updated:** 2026-11-13 (tab-focus reload fix; accounts editing, branch map pins, container numbers, liquidations module, customers module, installment schedule, CSV exports)

## Latest pass (2026-11-12): modules + fixes

- **New screens/routes**: `/app/customers` (`CustomersPage`) and `/app/liquidations` (`LiquidationsPage`); nav items added in `src/lib/roles.ts`, icons in `AppShell`, routes in `router.tsx`.
- **Employees**: edit allowed for owner/GA (migration 014 policy); passwords and login emails are System Admin only via `supabase/functions/admin-update-user`.
- **Branches**: lat/lng + geocode + link parser + map preview + edit; `public_branches()` returns coordinates.
- **Containers**: `container_number` column, editable container/supplier form, CSV exports.
- **Sales**: installment down/parts/first-due-date with live 0%-interest schedule; Sales history with date filters, totals, CSV.
- **Fund requests**: liquidation UI removed (use `/app/liquidations`); list export added.
- **Loading**: `AuthContext` memoises `user` on scalar ids and only fetches the profile when the signed-in user id changes. Supabase re-emits `SIGNED_IN` on every browser-tab focus (`_recoverAndRefresh`), which previously remounted every page behind the splash loader; it is now ignored for the same user, so returning to the tab keeps the current page and its data.
- **Migrations to run**: `202611120013_public_site.sql`, `202611120014_branches_containers_accounts.sql`, `202611120015_liquidations.sql`.
- **Functions to deploy**: `create-employee` (still pending) and `admin-update-user`:
  `npx supabase functions deploy create-employee --no-verify-jwt --project-ref ylpcutmsolvmloqjnwze`
  `npx supabase functions deploy admin-update-user --no-verify-jwt --project-ref ylpcutmsolvmloqjnwze`

## Landing page motion (2026-11-12)

- `gsap@3.15.1` + `ScrollTrigger` now drive the public landing page: hero/fleet photo parallax, staggered reveals for section headers, feature/product/branch cards, inquiry/privacy/footer blocks, a top scroll-progress bar and a nav shadow after 16 px. Setup is one `gsap.context` in `LandingPage.tsx` (reverted on unmount) plus a second effect for branch cards that arrive from `public_branches()`. Everything is skipped when `prefers-reduced-motion: reduce`.
- `/login` has a floating “← Back to website” button; “Staff Login” links play a 240 ms exit animation before routing. Anchor buttons smooth-scroll and pulse the target section heading.
- If new `.pub-section` blocks are added, mark blocks with `data-reveal` (single) or `data-stagger` (animate children) — no extra JS needed.

## Status for next agent

| Phase | Status | Notes |
| --- | --- | --- |
| 1 Foundation | DONE | Auth, shell, employees, settings, branches, logo |
| 2 Products & prices | DONE | Varieties, SKUs, dated prices |
| 3 Inventory | DONE in code | Migration + UI exist — user must run SQL on Supabase if not yet |
| 4 Containers | DONE in code | Migration + UI exist — user must run SQL if not yet |
| 5 Sales | DONE in code | Migration + SalesPage (new sale, installments, DR, cashier shifts) — run SQL if not yet |
| 6 Expenses & reports | DONE in code | Migration + ExpensesPage + ReportsPage (CSV + print/PDF) — run SQL if not yet |
| 7 Petty cash | DONE in code | Migration + PcfPage (funds, vouchers, replenishment, report) — run SQL if not yet |
| 8 Fund requests | DONE in code | Migration + FundRequestsPage (full approval flow + liquidation) — run SQL if not yet |
| 9 Public website | DONE in code | Migration + LandingPage (/) + InquiriesPage (/app/inquiries) — run SQL if not yet |
| 10 Polish & launch | DONE in code | UI polish: logo favicon + PWA/social meta, refined tokens/components, premium shell, split login with trucks hero, dashboard metric cards, website redesign — `tsc` + `vite build` pass. System Admin is now a superuser in the UI and in RLS (migration 010). |

## Public website pass (2026-11-12)

- Landing page products now use the owner's price list: 8 brand/size items (Mama's Best Myanmar 50/25 kg, Japonica 25 kg, Super Mama 50 kg, Sweet Daisy Myanmar 25 kg, Bambin Myanmar 25 kg, Jasmine Generic 25 kg, Camel India 50 kg) with prices per sack. Hero, nav, fleet section and footer were reworded to match — no more Kasikas/5-variety copy.
- Inquiry form: honeypot, required DPA consent checkbox, field length limits, trimming, and a 60-second browser cooldown. New `#privacy` notice section. SEO: `robots.txt`, OG/Twitter tags, updated title.
- **Prices can be hidden**: Settings → Company profile has “Show prices on the public website” (`company_settings.show_public_prices`). The switch only appears after migration 013 is applied.
- **Branch maps**: branch cards on the landing page embed a Google map that searches the branch's saved **address** (falls back to the name if the address is empty), with an “Open in Google Maps” link. Settings → Branches now hints “use the full street address”; the table has a Map link to check the pin. Entering only “Cebu City” centres the map on the city — enter the street address for an exact pin.
- **Inquiry email**: `supabase/functions/notify-inquiry` emails staff on each new inquiry via Resend.
- **Sitemap/canonical**: set `VITE_SITE_URL` in `.env.local` and the Netlify environment; `vite build` then writes `dist/sitemap.xml`, adds `Sitemap:` to `robots.txt`, and injects canonical/og:url/absolute og:image.
- **Deployment steps still required**:
  1. Run `supabase/migrations/202611120013_public_site.sql` in the Supabase SQL editor.
  2. `npx supabase login`, then `npx supabase functions deploy notify-inquiry --no-verify-jwt --project-ref ylpcutmsolvmloqjnwze`.
  3. Set function secrets: `npx supabase secrets set RESEND_API_KEY=... INQUIRY_NOTIFY_TO=... INQUIRY_NOTIFY_FROM="JMG Website <website@yourdomain>"`.
  4. Add `VITE_SITE_URL=https://your-live-domain` to the Netlify environment and redeploy.
- Captcha was deliberately skipped (needs a Turnstile/hCaptcha site key from the owner).

## Motion and loading pass (2026-11-12)

- **Shared loading components** (`src/components/Loading.tsx`): `SkeletonText`, `SkeletonTable`, `SplashLoader`. CSS lives in `components/ui.css` (`.sk*`), colours in `tokens.css` (`--color-skeleton`, `--color-skeleton-shine`).
- **No more "Loading…" text anywhere**: all page-level loading states are skeleton rows; `RequireAuth` shows a spinner splash; the notification panel shows skeleton lines; button labels swap to an inline spinner via the new `Button loading` prop.
- **Click animation**: `ClickPulse` in `main.tsx` renders a ripple at every pointer press; press-scale/hover transitions on buttons, chips, nav links, quick links and table rows; page enter animation `.app-page`; pop-in notification panel; slide-in phone drawer. Motion tokens: `--ease-out`, `--motion-fast`, `--motion-base`; all disabled under `prefers-reduced-motion: reduce`.
- Two planning PDFs were read for direction: `PLAN/JMG Commodities – UI Redesign and Flow Cleanup Plan.pdf` and `PLAN/JMG Commodities System – Full Upgrade Plan (v2).pdf`. Their larger redesigns (U2+ tokens/layout changes, inventory tab restructure, Money out merge) are **not** implemented yet; only the motion/loading items were built.

## PLAN Part 2 build-out (2026-11-11)

Built from `../PLAN/JMG Commodities System – Build Handoff.md` Part 2 and the dashboard/new-sale mockups:

- **Dashboard** (`src/features/dashboard/DashboardPage.tsx`): branch selector for owner/GA/admin; four mockup metric cards (today's sales, cash on hand from encoded payments, customer balances, petty cash with low state); sales by variety for the last 7 days; stock on hand (variety · sack size, sacks, OK/Low); fund requests awaiting action with role-aware labels and Review/Release links. Styling in `dashboard.css` (tokens only).
- **Audit log** (`src/features/audit/AuditLogPage.tsx`, `/app/audit`): Owner/GA/System Admin only; table/action/search filters, expandable old/new JSON, CSV export; nav + route + `canViewAuditLog`.
- **Notifications** (`src/features/notifications/NotificationsBell.tsx`, topbar): derived alerts for fund requests awaiting you, low stock, low petty cash, overdue dues, arrived containers, in-transit transfers, and new inquiries. In-app only; no push/email. Alert queries are best-effort and fail silently.
- **Supplier payables** (`ContainersPage` purchases tab + `recordPurchasePayment`): balance column and payment recording with status `partial`/`paid`; purchase creation now validates supplier and total.
- **PWA**: `public/manifest.webmanifest` linked from `index.html`.
- **Required fields**: HTML `required` + asterisk styling via `.ui-field:has(:required)`; handlers validate amounts/dates outside forms.
- **Auth**: `profileLoading`/`profileError` in `AuthContext`, deadlock-safe auth events, no login loop when a profile is missing, local-scope sign-out fallback.

Verified: `tsc` clean, `vite build` passes, and the live dev session (System Admin) rendered the dashboard, notifications panel (20 low-stock alerts), audit log (18 rows), and the purchases payment card. Not built yet: fund-request attachments, container unloading photos, supplier price-increase alerts, per-customer statement of account.

## Latest feature pass (2026-11-11)

- **DB fix (migration 011)**: `202611110011_fix_containers_pcf.sql` is applied to the hosted project. It removes the containers RLS recursion (`can_view_container()` security-definer helper used by `containers`, `container_lines`, `container_costs` SELECT policies) and rebuilds `v_pcf_fund_balances` (security invoker, JSON `branch`/`custodian`, correct per-fund totals without the join multiplication).
- **PCF API**: `fetchFundBalances()` no longer embeds through the view; it reads the JSON columns directly.
- **Request for Fund typed lines**: an “Additional lines” editor (description + amount, add/remove) feeds the printable sheet, Excel export, and totals — for entering many request items without creating vouchers first.
- **Fund request types (migration 012)**: `fund_requests.request_type` = cash_advance (default) / reimbursement / purchase / other, selectable when creating a request. **Liquidation** is a tab inside Fund Requests (open = released, plus liquidated), keeping receipts and the approval trail on the same record.
- **PCF released date** defaults to today and remains editable; print layout is A4 portrait with only the sheet visible. Printer choice is an OS/browser dialog — cannot be restricted from the web app.

- **Sales**: stock-aware sale saving. `fetchAvailableStock(branchId, skuId)` reads `v_stock_on_hand`; the form shows available sacks and pre-checks the quantity before `create_sale`; `describeSaleError()` turns the RPC's `Insufficient stock for SKU …` into “Not enough stock for <variety> <size>kg at <branch> — N on hand, M requested.” Customer search (name/contact) on the picker and a text filter on Recent sales (customer / DR / OR).
- **PCF**: Branch Accountant can now open **Request for fund** (`canRequestPcfFund`). New printable **Request for Fund** and **PETTY CASH MONITORING** record sheets styled like the supplied forms (`src/features/pcf/pcf.css`). Export Excel + Print/PDF on Request, Record, and Report tabs.
- **Expenses**: date/category filters with filtered total, Export Excel, Export CSV, Print/PDF.
- **Shared**: `src/lib/export.ts` — `downloadCsv`, `downloadExcel` (SpreadsheetML `.xls`), `printPage`. No new dependencies.
- `tsc -b --force` and `vite build` pass. Export helpers were exercised against the running dev server (Excel blob + CSV quoting/bom + `a.download`), and the A4 print rules are served correctly. Full print preview / click-through not done (app is logged out; no credentials available).

## Remote state

Applied to the hosted project (`ylpcutmsolvmloqjnwze`) on 2026-11-11 via the SQL Editor:

| Item | State |
| --- | --- |
| Phase 8 migration (`fund_requests`, `fund_request_steps`, `liquidation_receipts`) | **Applied** — all three tables return HTTP 200 |
| Phase 9 migration (`inquiries`) | **Applied** — table returns HTTP 200 |
| Phase 10 migration (System Admin superuser) | **Applied** — verified 36 admin table policies, 3 storage policies, 22 superuser-aware `can_*` helpers |
| Migration 011 (containers RLS recursion + PCF view) | **Applied** — view returns 200; containers/lines/costs query cleanly as Branch Accountant |
| Migration 012 (`fund_requests.request_type`) | **Applied** — `select request_type` returns HTTP 200 |
| `create-employee` Edge Function | **Not deployed** — browser gets a CORS preflight failure until deployed |

Deploy the function:

```bash
npx supabase login
npx supabase functions deploy create-employee --project-ref ylpcutmsolvmloqjnwze
```

If you deploy from the Dashboard function editor instead, turn **Verify JWT off** (`supabase/config.toml` sets `verify_jwt = false`) — the function validates the caller and requires the `system_admin` role itself, and the gateway check blocks the browser CORS preflight.

Until the function is deployed, create staff accounts in Supabase Dashboard → Authentication → Users; the `handle_new_user` trigger adds their profile and you can set role/branch from `/app/employees`.

## Live project

- App folder: `jmg-system/`
- Stack: Vite + React + TS + Supabase + Netlify (later)
- Design: `#F6F3EC` bg, jade `#1F6B58`, Inter + Space Grotesk (per PLAN)
- Env: `.env.local` with `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
- User confirmed app works (login + Products as System Admin)

## Critical rule

Stock changes **only** via `stock_movements` ledger (RPCs). Money = `numeric(14,2)`. RLS always. Soft-delete + audit_log.

## Plan source of truth

`../PLAN/JMG Commodities System – Build Handoff.md`

## What next agent should do

1. Read this file + `CHANGELOG.md`
2. Confirm which migrations exist under `supabase/migrations/` (1–12 applied on hosted; 13–15 pending)
3. Continue Part 2 gaps: fund-request attachment uploads, container unloading photos, supplier price-increase alerts, per-customer statement of account; then finish the test checklist
4. After each phase: update `CHANGELOG.md` + this HANDOFF.md
5. Tell user which SQL files to run in Supabase SQL Editor

## SQL files (run in order; 1–12 applied on hosted)

Run in order in Supabase SQL Editor:
- `202611100001_phase1_foundation.sql`
- `202611100002_phase2_products_prices.sql`
- `202611100003_phase3_inventory.sql`
- `202611100004_phase4_containers_suppliers.sql`
- `202611100005_phase5_sales.sql`
- `202611100006_phase6_expenses_reports.sql`
- `202611100007_phase7_pcf.sql`
- `202611100008_phase8_fund_requests.sql`
- `202611100009_phase9_website.sql`
- `202611110010_phase10_system_admin.sql`
- `202611110011_fix_containers_pcf.sql`
- `202611110012_fund_request_types.sql`
- `202611120013_public_site.sql` — **pending** (price toggle column, public branches RPC, inquiry limits)
- `202611120014_branches_containers_accounts.sql` — **pending** (branch lat/lng, container number, owner/GA profile edits, coordinates in `public_branches()`)
- `202611120015_liquidations.sql` — **pending** (`liquidations` + `liquidation_items`, RLS incl. System Admin)

014 replaces `public_branches()` (adding latitude/longitude), so run it after 013 and the website will use exact pins once branches have coordinates set in Settings → Branches.

## Phase 9 build notes

- Table: `inquiries` (name, contact, message, branch_interest, status: new/read/replied/archived, reply_notes, replied_by, replied_at).
- RLS: anonymous INSERT allowed (public can submit); authenticated staff can SELECT + UPDATE.
- Public landing page at `/` — no auth required: hero, varieties (Kasikas Jasmine, Japonica, White, Parboiled, Glutinous), sack sizes (5/25/50 kg), why-us features, branch locations placeholder, inquiry form, footer with Staff Login link.
- Inquiry form calls `submitInquiry()` → `inquiries` table insert (works anon via Supabase anon key).
- Staff Inquiries page at `/app/inquiries`: filter by status, click to open detail, auto-marks new→read, mark replied (with notes) or archive.
- Nav item added for Owner, GA, BA, System Admin.
- Route `/` changed from redirect to `<LandingPage />`; `*` fallback changed to redirect to `/`.

## Phase 8 build notes

- Tables: `fund_requests`, `fund_request_steps`, `liquidation_receipts`.
- `fund_requests_validate_transition` enforces allowed transitions + actor role; `record_fund_request_step` records each step.
- Flow: draft → submitted → forwarded → approved → released → liquidated (or rejected).
- `fund-request-attachments` storage bucket.
- Role helpers in `src/lib/roles.ts`: `canCreateFundRequest`, `canReviewFundRequest`, `canApproveFundRequest`, `canReleaseFundRequest`, `canViewAllBranchesFundRequests`, `canViewFundRequests`.

## System Admin note

System Admin is a **superuser**: every nav item is visible (`src/lib/roles.ts` → `roleIn` / `canAccessNav`) and every permission helper returns true, including all-branch scopes. Migration `202611110010_phase10_system_admin.sql` mirrors this in the database (permission helpers, `assert_branch_access`, per-table `for all` policies, storage buckets). Run it after phases 8–9.

## Phase 8 note

`fund_requests_update` previously used `old./new.` inside a `WITH CHECK`, which is invalid in RLS and made the migration fail. Status-transition rules (including who may submit/forward/approve/release/liquidate) now live in the `fund_requests_validate_transition` trigger; the policy only checks row ownership/branch. An `AFTER INSERT` trigger records the `created` step.
