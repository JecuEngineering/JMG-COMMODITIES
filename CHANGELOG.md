# Changelog

## Required fields, auth/tokens finalisation, and PLAN Part 2 build-out (2026-11-11)

- **Required fields**: every form field that is structurally required now carries the HTML `required` attribute, shows an automatic asterisk via `.ui-field:has(:required)`, and handlers guard submission outside forms. Covered: sale save (installments/down payment), installment collection, expenses (date, amount > 0), PCF vouchers (date/payee/amount) and replenishments (reference/amount), fund-request liquidation (actual spent, receipts), employee creation (name, role, branch for branch-scoped roles), purchases (supplier, total > 0), and supplier payment (amount).
- **Design tokens finalised**: added `--color-on-brand`, `--color-warning-border`, `--color-info`, `--color-info-soft`; replaced hardcoded `#fff`, gold, jade, danger/ok borders and status colours across shell, auth, landing, fund requests and inquiries with tokens. New dashboard CSS uses tokens only.
- **Auth/token hardening**: `AuthContext` now exposes `profileLoading` / `profileError`, treats missing or deactivated profiles distinctly, handles `TOKEN_REFRESHED` without refetching the profile, defers other auth events out of the Supabase callback (deadlock-safe), and `signOut` falls back to local scope while always clearing state. `RequireAuth` shows a loading state, an error state with Sign out, or redirects — no more login loops. The login page surfaces profile-load errors.
- **PCF fund setup**: the Funds tab now includes “Set up petty cash fund” (branch, opening fund, low threshold, notes) so a branch without a fund is no longer a dead end; one fund per branch is enforced by the database.
- **PLAN Part 2 — dashboard**: matches the supplied mockup — branch selector for all-branch roles, metric cards (today's sales, cash on hand from encoded payments, customer balances, petty cash with a “Replenish soon” state), sales by variety (last 7 days, proportional bars), stock on hand (variety · size, sacks, OK/Low badge), and fund requests awaiting action with role-aware status labels (Waiting on accounting / owner / Ready to release) and Review/Release links.
- **PLAN Part 2 — audit log**: new `/app/audit` screen (Owner, General Accountant, System Admin) with table/action/search filters, expandable old/new values, and CSV export. Wired into the sidebar, phone drawer, and routes.
- **PLAN Part 2 — notifications (§8)**: topbar bell with a derived, role-aware alert list — fund requests waiting on you, low stock, low petty cash, overdue installment dues, arrived containers, in-transit transfers, and new website inquiries. Alerts load on mount and refresh when the panel opens; no push/email channel (in-app only).
- **PLAN Part 2 — supplier payables**: the Purchases tab now shows a balance column plus a “Record supplier payment” card (open payables total, purchase picker with remaining balance, amount validation). Payments update `paid_amount` and set status to `partial` or `paid`.
- **PWA**: added `public/manifest.webmanifest` (standalone, jade theme, app icon) and linked it from `index.html`, completing the PWA item from the Phase 10 checklist.
- **Verification**: `npx tsc -b --force` clean, `npx vite build` passes. Exercised in the running dev server with the live System Admin session: dashboard renders with branch selector/metrics/sections, notification bell opens with 20 low-stock alerts, audit log lists 18 entries, and the Purchases tab shows the payment card. A transfers alert query initially returned 400 because `transfers` has no `deleted_at` column — fixed. Part 2 items deliberately not built yet: fund-request attachment uploads, container unloading photos, supplier price-increase alerts, and a per-customer statement of account (receivables report covers balances).

## Fund requests: cash advance + liquidation tab; PCF released date (2026-11-11)

- **Migration 012** (`202611110012_fund_request_types.sql`, applied): adds `fund_requests.request_type` with `cash_advance` (default), `reimbursement`, `purchase`, `other` and a check constraint.
- **Fund Requests**: the create form now has a **Request type** selector; lists show a Type column; the detail card subtitle shows type + status. This covers cash advances for laborers/employees within the existing approval chain.
- **Liquidation placement**: added a **Liquidation** tab inside Fund Requests (not a separate menu). It lists `released` (open) and `liquidated` requests, with the open count in the tab label. Opening a released request shows receipts plus actual-spent / returned-amount entry, then “Mark as liquidated”. This keeps each liquidation tied to its request, approval trail, and branch permissions.
- **PCF Request for Fund**: `Released date` now defaults to today and stays editable (resets to today when the branch fund changes).
- **PCF print**: the sheet is A4 portrait and print CSS hides the shell, page header, chips, and control cards so only the form prints; table header shading is preserved with `print-color-adjust: exact`. Added an inline note: the browser print dialog always lists installed printers — choose the EPSON L1320 there; a website cannot pre-select or hide printers.
- **Export verification (runtime, dev server)**: called the real `downloadExcel` / `downloadCsv` from `/src/lib/export.ts` in the browser — Excel output is 910 bytes, `application/vnd.ms-excel`, includes the sheet name, escapes `<` `>` `&`, and writes totals; CSV sets `a.download`, quotes commas/quotes/newlines, and uses the BOM. Print CSS was confirmed served with `@page { size: A4 portrait; margin: 12mm }` and the shell-hiding rules. Full print preview could not be exercised because the app session is logged out and no credentials are available in-session.
- `tsc -b --force` clean, `vite build` passes; `request_type` verified over REST (HTTP 200).

## PCF Request for Fund – typed lines (2026-11-11)

- The Request for Fund tab now has an **Additional lines** editor: description + amount inputs with **+ Add line** and **Remove**. Type as many lines as needed; they render immediately in the printable sheet under the voucher category totals and are included in `TOTAL EXPENSE`, `BALANCE`, and `FOR REQUEST`.
- Typed lines flow into **Export Excel** (one row each) and **Print / PDF** exactly as shown. Empty lines are ignored. Lines reset when switching branch funds.

## PCF + containers runtime fixes (2026-11-11)

- **Containers 500 (`42P17 infinite recursion detected in policy for relation "containers"`)**: `containers_select` referenced `container_lines`, whose policy referenced `containers` again. `supabase/migrations/202611110011_fix_containers_pcf.sql` adds a `security definer` helper `can_view_container(uuid)` and rewrites the `containers`, `container_lines`, and `container_costs` SELECT policies to call it, so branch visibility is evaluated without re-entering RLS. Applied to the hosted project.
- **PCF 400 (`PGRST200 … Could not find a relationship between 'v_pcf_fund_balances' and 'pcf_funds'`)**: PostgREST cannot embed relations through a view. The view now returns `branch` and `custodian` as JSON and `security_invoker = true` (base-table RLS applies). It also drops `fund_id` in favour of `id`, and the voucher/replenishment totals are now scalar subqueries — the previous single join multiplied voucher sums by the number of replenishments.
- `src/features/pcf/pcfApi.ts`: `fetchFundBalances()` selects the view directly (`select('*')`) and maps `branch` / `custodian` from the JSON columns; `PcfFundBalance` now declares `branch_name`.
- Verified: view returns HTTP 200 with the publishable key; as the Cebu Branch Accountant (`set role authenticated` + JWT claims) `containers`, `container_lines`, `container_costs`, and `v_pcf_fund_balances` all query without error (1 fund, ₱10,000.00 balance). `tsc -b --force` clean, `vite build` passes.

## Sales, PCF documents, and export pass (2026-11-11)

- **Sale saving**: `createSale` failures now surface actionable messages instead of the raw RPC text. New `fetchAvailableStock()` reads `v_stock_on_hand`; the New Sale form shows available sacks for the selected variety + sack size at the chosen branch, pre-checks quantity against live stock before calling `create_sale`, and `describeSaleError()` translates `Insufficient stock for SKU …`, branch-access, and role errors. Root cause on the hosted data: Cebu has 0 sacks for the seeded SKU while Main has 2,000 — the Branch Accountant is scoped to Cebu, so replenishment via Containers/Inventory is required.
- **Customer filtering (Sales)**: added a “Find customer” search above the customer picker (matches name or contact, keeps the current selection visible) and a “Filter sales” box on Recent sales (matches customer, DR, or OR number) with a “N of M shown” subtitle.
- **PCF accessible to Branch Accountant**: `canRequestPcfFund()` adds `branch_accountant`; the new **Request for fund** tab is visible to Owner/GA/BA. Voucher entry was already open to BA via `canManagePcf`; replenishment release stays with Owner/GA.
- **PCF Request for Fund sheet**: reproduces the supplied form — logo/company header, RFH #, date, description/purpose, `UNIT/ITEM · DESCRIPTION · AMOUNT` table (branch = PETTY CASH REPLENISHMENT, expense period, category totals), TOTAL EXPENSE / PCF FUNDING / BALANCE / FOR REQUEST, and the Requested by / Approved by (Finance Manager) / President / Released date / Thru signature row.
- **PCF monitoring record**: new **Record** tab prints the monthly PETTY CASH MONITORING sheet — Date / Ref / Particulars / Category / Expenses / Replenishment / Balance, opening fund row, running balance per entry (vouchers and replenishments merged by date), TOTAL row, and Prepared by / Custodian / Approved by signatures.
- **Exports**: new dependency-free `src/lib/export.ts` (`downloadCsv`, `downloadExcel`, `printPage`). Excel files are SpreadsheetML/HTML tables saved as `.xls` and open natively in Excel; PDF uses the browser print dialog.
  - PCF: Export Excel + Print/PDF on Request, Record, and Report tabs.
  - Expenses: From/To/Category filters with a filtered total, plus Export Excel, Export CSV, and Print/PDF (TOTAL row included in both exports).
- New `src/features/pcf/pcf.css` provides the paper-sheet styling and A4 print rules (`@page { size: A4 portrait }`, `.no-print` hidden).
- Verified with `npx tsc -b --force` (clean) and `npx vite build` (passes; only the existing >500 kB chunk-size advisory). UI click-through could not be done in-session because the app session is logged out and no credentials are on hand.

## Remote migrations applied (2026-11-11)

- Ran `202611100008_phase8_fund_requests.sql`, `202611100009_phase9_website.sql`, and `202611110010_phase10_system_admin.sql` against the hosted project (`ylpcutmsolvmloqjnwze`) in the Supabase SQL Editor — all three returned "Success. No rows returned".
- Verified with REST probes: `inquiries`, `fund_requests`, `fund_request_steps`, `liquidation_receipts` all return HTTP 200 (previously 404 / PGRST205).
- Verified migration 010 effects: 36 `*_system_admin_all` table policies, 3 matching storage policies, and 22 `can_*` helpers that include the `system_admin` case.
- Remaining remote action: deploy the `create-employee` Edge Function. See `HANDOFF.md`.

## Fix pass – System Admin access, migration 8 bug, deploy notes (2026-11-11)

- `src/lib/roles.ts`: System Admin is now a superuser — `canAccessNav` shows every menu item, and all `canView*` / `can*` helpers use a `roleIn()` check that returns true for `system_admin`. All-branch helpers (`canViewAllBranchesSales`, `canViewAllBranchesExpenses`, etc.) now include admin.
- `src/features/sales/SalesPage.tsx` + `src/features/expenses/ExpensesPage.tsx`: replaced hardcoded `role === 'owner' || role === 'general_accountant'` branch-scope checks with `canViewAllBranchesSales` / `canViewAllBranchesExpenses`, so the System Admin sees the branch picker and all-branch data.
- `supabase/migrations/202611100008_phase8_fund_requests.sql`: removed invalid `old./new.` references from the `fund_requests_update` RLS policy (this is why the migration failed to run). Status transition + actor-role rules now live in the `fund_requests_validate_transition` trigger, and a new `AFTER INSERT` trigger records the `created` step.
- `supabase/migrations/202611110010_phase10_system_admin.sql` (new): System Admin superuser access in the database — redefines all `can_*` helpers, allows any branch in `assert_branch_access`, adds per-table `for all` admin policies, and admin storage policies for the three buckets.
- `supabase/functions/create-employee/index.ts` + `supabase/config.toml`: added `Access-Control-Allow-Methods` and a 200 status on the OPTIONS preflight, and set `verify_jwt = false` (the function still validates the caller and the `system_admin` role) so the browser call is not blocked by CORS.
- `src/app/AppShell.tsx` + `shell.css`: added a phone ☰ **All modules** drawer that lists every module the role can access (previously phones could only reach the four bottom-nav tabs), with backdrop/close, body-scroll lock, and sign-out. Sign-out styles are now shared by sidebar and drawer.
- `EmployeesPage.tsx`: on function errors it now reads the function's JSON `error` (e.g. duplicate email) and only shows the deploy hint for fetch/CORS failures.
- Hosted DB still needs phases 8, 9 and 10 SQL applied; `create-employee` still needs `npx supabase functions deploy create-employee --project-ref ylpcutmsolvmloqjnwze`. See `HANDOFF.md`.
- Re-verified: `npx tsc -b --force` clean, `npx vite build` passes.

## Phase 10 – UI polish & launch prep (2026-11-11)

- `index.html`: replaced the SVG favicon with the real `JMG COMMODITIES.jpeg` logo (icon + apple-touch-icon), added PWA-friendly viewport/viewport-fit and `theme-color`, plus description and Open Graph tags (using `JMG TRUCKS.jpg` as the share image).
- `src/styles/tokens.css`: refined design system — new surface/raised surfaces, jade light/muted, gold accents, ink scale, soft/card/elevated shadows, 20px card radius, 272px sidebar, 76px bottom nav, 1200px content width.
- `src/styles/global.css`: improved base typography (Inter 450 weight, tighter display headings), focus-visible rings, page/stack/row helpers, empty/error/success states with icons, and reusable dashboard metric-card styles.
- `src/components/ui.css`: polished buttons (primary/secondary/ghost/danger with hover elevation and press states), cards with header dividers, fields with focus rings, pill chips, badges, and refined tables (uppercase headers, tfoot, hover rows).
- `src/app/shell.css`: premium shell — sticky blurred mobile topbar, full bottom nav with icons + safe-area padding, white sidebar with nav icons, active accent bar, and danger-tinted sign-out button.
- `src/features/auth/auth.css` + `LoginPage.tsx`: full-screen split login — left hero panel using the JMG trucks photo with gradient overlay, logo, tagline, and variety badges; right form panel with logo, company name from `company_settings`, and links back to the website.
- `src/app/AppShell.tsx`: nav icons for every menu item, JMG logo (falls back to `/JMG COMMODITIES.jpeg`) in sidebar and topbar, and cleaner branch/role display.
- `src/features/dashboard/DashboardPage.tsx`: redesigned dashboard — date + greeting hero with today's sales summary, receivable/expense/low-stock/fund-request metric cards (colors + alerts), and role-aware quick-action links.
- `src/features/website/LandingPage.tsx`: real JMG logo in nav/hero/footer, full-bleed JMG trucks hero with gradient, hero stats, a Kasikas fleet showcase section, richer variety/feature/branch cards, and preserved the Phase 9 inquiry form.
- `src/features/website/website.css`: full public-site style system — glass sticky nav, viewport hero, glass/outline buttons, variety/feature/branch grids, trucks showcase, inquiry form, and three-column footer.
- Verified with `npx tsc -b --force` (clean) and `npx vite build` (passes; only the existing >500 kB chunk-size advisory).

## Phase 9 – Public website (2026-11-11)

- Added `inquiries` table (`name`, `contact`, `message`, `branch_interest`, `status`: new/read/replied/archived, `reply_notes`, `replied_by`, `replied_at`).
- RLS: anonymous INSERT allowed so the public form works without login; authenticated staff can SELECT + UPDATE.
- Public landing page at `/` (no auth): hero with tagline, 5 rice varieties grid (Kasikas Jasmine, Japonica, White, Parboiled, Glutinous) with sack sizes (5/25/50 kg), why-choose-us features section, branch locations section, contact/inquiry form, footer with Staff Login link.
- Inquiry form calls `submitInquiry()` → inserts into `inquiries` via Supabase anon key — works without any login.
- After submitting, the form shows a success confirmation with the sender's name and contact.
- Staff Inquiries page at `/app/inquiries`: filter by status (New / Read / Replied / Archived / All), click any row to open the detail panel, auto-marks new→read when opened, reply with notes and mark as Replied, or Archive.
- Inquiries nav item added for Owner, GA, BA, System Admin (matches Phase 1 permission matrix).
- Route `/` now renders `<LandingPage />` instead of redirecting to `/app`; wildcard `*` redirects to `/`.
- `src/lib/roles.ts`: added `canViewInquiries` and `canManageInquiries` helpers; added `inquiries` to `NavItemId`.

**How to test Phase 9**
1. Apply `supabase/migrations/202611100009_phase9_website.sql`.
2. Open the app root URL (`/`) without logging in — confirm the public landing page loads.
3. Fill in the inquiry form (name, contact, message) and submit — confirm the success message appears.
4. Log in as Owner, GA, or BA — confirm "Inquiries" appears in the sidebar.
5. Open `/app/inquiries` — confirm the submitted inquiry appears under "New".
6. Click it — confirm it auto-moves to "Read".
7. Add reply notes and click "Mark as replied" — confirm status becomes "Replied".
8. Archive an inquiry and confirm it moves to "Archived".
9. As System Admin or Cashier/Warehouse: confirm "Inquiries" is not shown (System Admin has it; Cashier/Warehouse do not).

## Phase 8 – Fund requests (2026-11-11)

- Added `fund_requests` (requester, branch, purpose, category, amount, status, release method/ref/bank, liquidation fields, rejection), `fund_request_steps` (action, actor, reason, release details), and `liquidation_receipts` tables.
- Statuses: `draft → submitted → forwarded → approved → released → liquidated` (or `rejected` at any review step).
- `validate_fund_request_transition` trigger **enforces step order** — a request cannot skip a step (e.g. draft cannot go directly to approved).
- `record_fund_request_step` trigger auto-logs every status change with timestamp and actor.
- RLS per the permission matrix:
  - Employee/Warehouse: create + submit own requests; liquidate own released requests.
  - Branch Accountant: review/forward/reject own-branch requests; liquidate.
  - Owner: approve/reject forwarded requests (all branches).
  - General Accountant: release approved requests (online transfer or check, with reference + bank).
- `fund-request-attachments` storage bucket for liquidation receipt photos.
- Fund Requests screen: tabs for My requests, For review (BA), For approval (Owner), For release (GA), All. Detail panel shows timeline + action buttons per status; liquidation supports adding receipts (description + amount) and recording actual spent / returned amount.

**How to test Phase 8**
1. Apply `supabase/migrations/202611100008_phase8_fund_requests.sql`.
2. As Employee: create a draft fund request (purpose, category, amount). Submit it.
3. As Branch Accountant: open "For review", see the request. Forward it to Owner (or reject with a reason).
4. Confirm the BA **cannot** approve or release — only forward/reject.
5. As Owner: open "For approval", approve it (or reject).
6. As General Accountant: open "For release", choose online transfer or check, enter reference number + bank, release.
7. Back as Employee (or BA/Owner/GA): open the released request, add liquidation receipts, enter actual spent + returned amount, mark liquidated.
8. Confirm the timeline shows every step with the correct actor and timestamp.
9. Try to skip a step (e.g. submit → approve directly) — confirm the DB rejects it.

## Phase 7 – Petty cash fund per branch (2026-11-11)

- Added `pcf_funds` (branch, custodian, fund amount, low threshold), `pcf_vouchers` (payee, purpose, category, amount, receipt photo), `pcf_replenishments` (amount, reference, vouchers covered).
- `v_pcf_fund_balances` view derives running balance = opening fund − vouchers + replenishments (never stored).
- RLS: Owner/GA view + manage all branches; Branch Accountant view + manage own branch; only Owner/GA can record replenishments.
- `pcf-receipts` storage bucket for voucher receipt photos.
- Seeds a default ₱10,000 PCF fund per active branch.
- PCF screen: Fund balance cards with low-fund alerts, voucher encoding (with optional receipt), voucher list, replenishment form (GA/Owner) showing unrecovered vouchers count + total, and a printable PCF report.

**How to test Phase 7**
1. Apply `supabase/migrations/202611100007_phase7_pcf.sql`.
2. As Branch Accountant: open Petty Cash. Confirm a ₱10,000 fund exists for your branch.
3. Create a voucher (payee, category, amount, optional receipt photo). Confirm the balance drops by that amount.
4. Confirm you cannot see the Replenish tab (only Owner/GA can).
5. As General Accountant: open Petty Cash, select a branch, open Replenish. Confirm unrecovered vouchers count + total are shown.
6. Record a replenishment amount equal to the vouchers total. Confirm balance returns to ₱10,000.
7. Confirm low-fund alert appears when balance ≤ low threshold.
8. Open the Report tab and click Print / PDF — confirm opening, vouchers total, replenishments total, and balance match.

## Phase 6 – Expenses & reports (2026-11-11)

- Added `expense_categories` and `expenses` tables with RLS (owner/GA/BA view; owner/GA all branches, BA own branch).
- `expense-receipts` storage bucket with read/write policies; optional receipt photo upload.
- Seeded default categories: Utilities, Trucking, Labor, Supplies, Repairs, Other.
- `v_daily_sales` view for daily totals (sales count, total, collected, balance).
- Expenses screen: encode expense (branch, category, date, amount, payee, notes, receipt) and list.
- Reports screen: Summary (sales, collected, receivables, expenses, net, cash on hand), Sales list, Receivables, Revenue per variety. Date-range + branch filters. CSV export and Print/PDF on every tab.
- Dashboard now shows live metrics: today's sales, receivables, today's expenses, low-stock count.

**How to test Phase 6**
1. Apply `supabase/migrations/202611100006_phase6_expenses_reports.sql`.
2. As Branch Accountant: open Expenses, encode an expense with a category and amount; confirm it appears in the list.
3. As Owner / General Accountant: confirm you see expenses across all branches; BA sees only own branch.
4. Open Reports: set a date range covering existing sales. Confirm Summary totals match the Sales list.
5. Confirm Receivables tab lists only sales with balance > 0.
6. Click Export CSV on each tab and open the file in Excel/Numbers.
7. Click Print / PDF and confirm the report prints cleanly (use "Save as PDF").
8. Dashboard cards should populate with today's sales, receivables, expenses, and low-stock count.

## Phase 5 – Sales, customers, installments (2026-11-11)

- Added `customers`, `sales`, `sale_items`, `payments`, `installment_plans`, `installment_dues`, `cashier_shifts`, `delivery_receipts` with RLS.
- Payment types: cash, GCash, bank, check, installment. Sales status: completed, void.
- `create_sale` RPC: inserts sale + items, deducts stock via `stock_movements`, records down payment, generates per-branch DR number, creates installment dues if installment.
- `collect_sale_payment` RPC: records a payment and updates the sale balance (no interest, no penalty).
- `open_cashier_shift` / `close_cashier_shift` RPCs with expected vs counted cash and difference.
- Sales screen (phone-first): New sale (customer, variety, sack size, sacks, price, payment type, OR number, installment parts + down payment), Sales list + collect payment, Overdue installments, Cashier shifts, printable Delivery Receipt with logo.
- Stock is deducted only through `stock_movements`; money is `numeric(14,2)`.

**How to test Phase 5**
1. Apply `supabase/migrations/202611100005_phase5_sales.sql`.
2. As Cashier: open the Sales screen, pick a variety + sack size, confirm price auto-fills from the price list.
3. Save a cash sale — confirm stock for that SKU drops (Inventory → On hand) and a DR number is shown.
4. Save an installment sale (e.g. 3 parts, down payment) — confirm balance = total − down payment.
5. Collect a payment on that sale — confirm balance decreases; overdue list updates.
6. Open a cashier shift with opening cash, record a sale, then close with counted cash — confirm difference is computed.
7. Print the Delivery Receipt — confirm logo, company details, items, totals, DR/OR numbers appear.
8. As Owner/GA: confirm you see sales from all branches; Cashier/BA see only own branch.

## Phase 3 – Inventory (2026-11-10)

- Added `stock_movements` ledger as the only source of stock truth, plus `v_stock_on_hand`.
- Stock in, adjustments (warehouse request → BA/Owner approve), stock card, low-stock alerts (`skus.reorder_level`).
- Repacking with input/output lines, weight lost, and `repack_out` / `repack_in` movements.
- Branch transfers: draft → ship (`transfer_out`, in transit) → receive (`transfer_in`, differences flagged).
- All stock writes go through security-definer RPCs; direct movement inserts are blocked by RLS.
- Inventory UI tabs: On hand, Stock in, Adjust, Stock card, Repack, Transfers.

**How to test Phase 3**
1. Apply `supabase/migrations/202611100003_phase3_inventory.sql` (and re-run seed for sample stock).
2. As Warehouse: post stock in at your branch; confirm On hand increases.
3. Open Stock card for that SKU — running balance must equal the sum of movements.
4. As Warehouse: submit an adjustment (− qty) with a reason → stays pending.
5. As Branch Accountant: approve it → movement appears; reject path leaves no movement.
6. Repack 50kg → 25kg with weights; confirm weight lost and both movement types.
7. Transfer Main → Cebu: ship (sender stock down, In transit) then receive at Cebu (stock up). Try a short receive qty and confirm Difference badge.
8. As Cashier: Inventory visible, create actions hidden.
9. As Owner/GA: filter all branches; low-stock rows show when on hand ≤ reorder level.

## Phase 2 – Products and prices (2026-11-10)

- Added `varieties`, `skus`, and immutable dated `prices` tables with RLS.
- Price changes insert a new row and are written to `audit_log` via trigger.
- Built Products & Prices screens: varieties, sack-size SKUs (5/25/50kg + barcode), current price list, and price history.
- Only Owner / System Admin manage products; Owner / General Accountant set prices.
- Seed sample varieties, SKUs, and opening prices.

**How to test Phase 2**
1. Apply `supabase/migrations/202611100002_phase2_products_prices.sql` and run `seed.sql`.
2. As Owner or System Admin: add a variety and SKUs for 5/25/50kg.
3. As Owner or General Accountant: set a price with an effective date.
4. Set a second, later price for the same SKU — history must show both rows; “current price” uses the latest effective date ≤ today.
5. As Cashier / Warehouse: confirm Products menu is visible but create/price controls are hidden.
6. As Employee: confirm Products menu is not shown.

## Phase 1 – Foundation (2026-11-10)

- Scaffolded Vite + React + TypeScript with feature folder structure and design tokens (`#F6F3EC`, jade `#1F6B58`, Inter + Space Grotesk).
- Supabase migration for `branches`, `profiles`, `company_settings`, `audit_log` with RLS helpers.
- Login page with company logo, session guard, role-aware shell (sidebar on laptop, bottom tabs on phone).
- Employee management (add via edge function, edit, deactivate, assign role/branch).
- Company settings with logo upload to Storage (`company-assets`).
- Branches panel in Settings (add / deactivate).
- Roles: Owner, General Accountant, Branch Accountant, Cashier, Warehouse, Employee, System Admin.

**How to test Phase 1**
1. Create a Supabase project; copy `.env.example` → `.env.local`.
2. Run Phase 1 migration; create a System Admin auth user and set `profiles.role = 'system_admin'`.
3. Deploy `create-employee` function (optional for Add employee).
4. Sign in as each role and confirm only allowed menu items appear.
5. Upload logo in Settings; confirm it shows on login and header.
6. Add/edit/deactivate an employee as System Admin; Owner/GA can view only.
