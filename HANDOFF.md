# JMG System – Agent Handoff

**Last updated:** 2026-11-15 (Receipts attachable from the expense list/report tables with View/Replace, exports carry a RECEIPT column of 7-day signed links per row; Expense receipt attachments (photo/PDF), sales history first with the collect-payment moved into a modal, Today/All-dates quick filters; before that: PCF expense sheets with cut/history, sales history color-coded money summary, Liquidations module removed, SKU renamed to Rice variety; Petty cash restructure — Cebu fund ₱50,000, ₱5,000 voucher cap, Vouchers+Expenses merged into one Expenses ledger, liquidation report in the PETTYCASH MONITORING matrix, PCV numbering, November 9–14 Cebu sheet imported (29 vouchers / ₱17,339); `create_sale` accepts `p_payments` and `p_dr_number`; Sales CEBU Sales-In ledger imported — 561 sales / 832 lines / ₱56,459,750; desktop layout from 720 px with an icon rail on laptop/Mac windows; per-tab sessions ending on tab close + 5-minute idle sign-out; official company details on the public site; account editing, branch map pins, container numbers, customers module, installment schedule, CSV exports)

## Mobile page width fix (2026-11-15)

- Wide tables must never size the app shell. `.shell` uses `grid-template-columns: minmax(0, 1fr)` on mobile and `var(--sidebar-width) minmax(0, 1fr)` on desktop, and `.shell-main`/`.shell-content` have `min-width: 0`; without this, a `1fr` track takes the table's min-content width, the page grows to ~1025 px on a phone and the mobile browser shrinks/zooms the UI. Verify any new wide panel by checking `document.documentElement.scrollWidth === innerWidth` at 390 px; always wrap raw tables in `.ui-table-wrap` or another `overflow-x: auto` box.
- `.ui-input` is 16 px under 720 px to stop iOS focus zoom; `.sales-money` stacks to one card per row under 720 px.

## Receipts from the expense list + aligned exports (2026-11-15)

- **Attach from anywhere**: the RECEIPT column in the Expense list, the recent-vouchers table and the sheet-history modal now shows **Attach** when `receipt_path` is empty and **View** + **Replace** when it is set (`pickReceipt`, `onReceiptPicked`, `receiptCell` in `PcfPage.tsx`). All of them use one hidden `input[type=file]` (`accept="image/*,application/pdf"`) at the bottom of the page, so the receipt can be added after the expense was imported. Upload writes `${fund_id}/${Date.now()}-${sanitized name}` to `pcf-receipts` and updates `pcf_vouchers.receipt_path`; the list reloads afterwards.
- **Aligned exports**: **Export Excel** (expenses and liquidation report) and **Export CSV** now end every row with a **RECEIPT** cell: `View receipt` for rows that have one, `No receipt` otherwise. Each row therefore stays on the same line as its voucher. `.xls` here is HTML, so receipt images cannot be embedded; instead `receiptLinkMap` creates a **7-day signed URL per path** (`pcfReceiptUrl(path, 604800)`) and `receiptExportCell` returns a `{ text, href }` cell.
- **`src/lib/export.ts`**: `ExportCell` accepts `{ text, href }`; `downloadExcel` renders it as `<a href="…">text</a>` (real Excel hyperlink) and `downloadCsv` writes the plain URL so the CSV stays aligned too.
- **CSS**: `.pcf-receipt-cell` (inline-flex, 8 px gap, no wrap) keeps View/Replace on one line.
- **Preview modal**: `src/features/pcf/ReceiptPreview.tsx` takes `{ path, label, onClose }`, resolves a 1-hour signed URL and renders the image or PDF inside a `size="xl"` `Modal` (`.receipt-preview*` in `pcf.css`); the footer keeps an explicit **Open in new tab** for printing plus **Close**. Every receipt link (expense list, recent vouchers, sheet history, report, Request for Fund) opens this modal instead of `window.open`.

## Expense attachments + sales layout (2026-11-15)

- **PCF attachment**: `PcfPage` New expense form uses a styled `.pcf-attach` picker (`accept="image/*,application/pdf"`) with file name, Replace and Remove; upload path is `${fund_id}/${Date.now()}-${sanitized file name}` in the private `pcf-receipts` bucket. The stored `receipt_path` is unchanged, so existing View links (ledger, sheet history, report) work for PDFs too. CSS is in `src/features/pcf/pcf.css`.
- **Sales order**: the Collect installment payment card was removed from the top of the Sales tab. `payOpen` now drives a modal opened from the header **Collect payment** button; selecting a sale prefills the amount with its balance; saving closes the modal. **Sales history is the first card** on the tab.
- **Quick date filter**: **Today** sets `historyFrom`/`historyTo` to `todayInputValue()` (primary styling while active); **All dates** clears both. `exportSalesHistory` writes `ledgerSales`, i.e. the filtered rows.
- **Labels**: PCF's primary action is **Add expense** / **New expense** / **Save expense**.

## PCF expense sheets — cut, history, report by sheet (2026-11-15)

- **Data**: migration `202611150022_pcf_expense_periods.sql` (**applied**) adds `pcf_periods` (`id, fund_id, label, start_date, end_date, status open|closed, replenishment_id, notes, closed_by, closed_at`), the partial unique index `pcf_periods_one_open_idx` (one open sheet per fund), `pcf_vouchers.period_id`, RLS mirroring pcf_vouchers, view `v_pcf_period_totals` (voucher_count/total) and the RPC `close_pcf_period(p_period_id, p_label, p_notes)`.
- **Auto-assignment**: the `pcf_voucher_assign_period` trigger puts every new voucher into the fund's open sheet, creating one labelled `NOV 9`-style from the voucher date when none exists. `createVoucher` needs no change.
- **Cut flow**: `closePeriod()` calls the RPC; it locks the sheet, sets `end_date = max(voucher_date)`, label/notes/closed_by/closed_at, then opens the next sheet starting `greatest(last+1, current_date)`. UI: Expenses → **Current expense sheet** card with **End sheet / Cut** (modal: name, notes, entry/total/to-replenish summary, warning to record the replenishment first) and **Add expense**.
- **History**: closed sheets list in **Sheet history** with dates, entries, total and notes; **View** opens a modal with that sheet's vouchers and receipt links. Nothing is ever merged into the current sheet.
- **Report**: the from/to inputs were replaced by an **expense sheet** selector (`periods` from `v_pcf_period_totals`); matrix rows/totals, Excel export and the print sheet follow the selection. Replenishments are matched by `replenishment_id` when set, else by the sheet's date range.
- **Frontend**: `src/features/pcf/pcfApi.ts` (`PcfPeriod`, `fetchPeriods`, `closePeriod`; `fetchBranchVouchers` removed with Liquidations); `src/features/pcf/PcfPage.tsx` (period state, `openPeriod`/`currentPeriodVouchers`/`reportPeriod`/`closedPeriods`/`historyVouchers`, cut/history modals); `src/features/pcf/pcf.css` (`.pcf-current-sheet`, `.pcf-sheet-badge`, `.pcf-cut-summary`, `.pcf-cut-warning`).
- **Backfill**: Cebu open sheet **NOV 9** — 29 vouchers / ₱17,339; Main open **NOV 15** — 0. Verified via `v_pcf_period_totals` on production.

## Sales history money summary (2026-11-15)

- The two muted summary lines under the filters are replaced by a `.sales-money` container: Gross / Collected / Balance on top (Balance red when > 0, green when settled) and Cash / GCash / Check below, each in its own tinted card. CSS lives in `src/features/sales/sales.css`; values still come from `historyTotals` and `paymentTotals` (filtered set, not just the page).

## Liquidations module removed (2026-11-15)

- PCF expenses **are** the liquidation, so the separate module is gone: `src/features/liquidations/` deleted, route `/app/liquidations` removed from `router.tsx`, nav item and `canViewLiquidations`/`canPrepareLiquidation` removed from `src/lib/roles.ts`, icon removed from `AppShell.tsx`. The liquidation DB tables/RLS from migration 015 were left in place (no data loss) and Fund Requests' receipt tables are unaffected.

## SKU wording (2026-11-15)

- User-facing **SKU** is now **Rice variety**, or **sack size** where the distinction matters (Products sizes, inventory repacking, low-stock notification). Touched `ProductsPage`, `ContainersPage`, `InventoryPage`, `SalesPage`, `NotificationsBell`. DB/table/column names and TS identifiers still use `sku`.

## Petty cash restructure + liquidation report (2026-11-15)

- **Fund**: Cebu = **₱50,000**, Main = ₱10,000 (`202611150020_pcf_rules_and_cebu_fund.sql`, applied). New vouchers are capped at **₱5,000** by the `pcf_voucher_limit` trigger and by the form; larger spends go to Fund Requests.
- **Module layout** (`src/features/pcf/PcfPage.tsx`): tabs are now **Funds · Expenses · Replenishments · Report**. Vouchers and Expenses were the same thing, so they are one **Expenses** ledger — PCV#, date, description, classification, purpose, amount, receipt and replenishment status — with from/to/classification/search filters, Excel/CSV, print and pagination. `ExpensesPanel` (`src/features/expenses/ExpensesPanel.tsx`) and the extra tab were removed; `/app/expenses` still redirects to `/app/pcf` and the nav item stays out of `src/lib/roles.ts`.
- **Liquidation report**: Report renders the company's **PETTY CASH MONITORING** matrix from `PETTYCASH MONITORING 2026 CEBU PCF.xlsx`: DATE · PCV# · DESCRIPTION · the 16 **ACCOUNT CLASSIFICATION** columns · AMOUNT, with per-classification totals and a grand total, monitoring-period from/to, Approved by, Prepared/Custodian/Approved signatures and receipt links on screen. **Export liquidation Excel** writes the same matrix; **Print/PDF** uses a named `pcf-landscape` page rule so only the sheet prints, on one A4 landscape page.
- **PCV numbers**: `pcf_vouchers.voucher_no` (migration 021) is assigned by the `pcf_voucher_assign_no` trigger as `PCV-0001`, `PCV-0002`, … per fund, unique on `(fund_id, voucher_no)`. Lists, the report and exports use the stored number (derived numbering remains only as a fallback).
- **Imported November data**: migration `202611150021_pcf_liquidation_cebu_november.sql` (applied) imported the **NOVEMBER 9-** sheet — 29 vouchers dated 11/9–11/14, PCV-0001…PCV-0029, **₱17,339** — into the Cebu fund, mapped to the sheet's classifications. Cebu balance is now **₱32,661**.
- **RFH moved to Fund Requests** (`src/features/fund-requests/RequestFundPanel.tsx`, tab **Petty cash RFH**, visible to BA/Owner/GA): the paper Request for Fund form, category rows from the selected fund's vouchers in the period, typed additional lines, receipt review, Excel and print. **Create fund request** saves a draft `cash_advance` (`purpose` = the sheet's purpose, `notes` carries the RFH # and period) for the user's branch; it then follows the normal review → approve → release flow. `can_create_fund_request` now includes `branch_accountant` (DB function in migration 020 + `src/lib/roles.ts`).
- **Receipts**: `pcfReceiptUrl` creates a 1-hour signed URL. Expenses/Report/recent vouchers show a **View** link. (The Liquidations screen described here was **removed on 2026-11-15** — PCF expenses are the liquidation; `liquidation_items` rows from migration 020 remain in the DB but nothing in the UI writes them now.)
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; production shows Cebu **29 vouchers / ₱17,339** (`PCV-0001`–`PCV-0029`, trigger test produced `PCV-0030` in a rolled-back transaction). The report was rendered offline with the imported rows at 1500 px and printed to a 1-page A4 landscape PDF. No staff login was available in the in-app browser, so the authenticated screen itself was not clicked through.


## Shared UI additions (2026-11-15)

- **`src/components/Pagination.tsx`**: `usePaged(items, initialSize = 10)` keeps `page`/`pageSize` state and returns `pageItems`, `pageCount`, `total`, `start`, `end`, `setPage`, `setPageSize` (switching size resets to page 1). `<Pagination … noun="sale" />` renders “Rows per page 10/25/50”, “x–y of N”, and windowed page buttons. Every data table uses it; totals/tfoot rows are still computed from the full filtered array, not the page.
- **`src/components/DateInput.tsx`**: styled trigger + portal calendar popover (`position: fixed`, month navigation, selected/today states, Today/Clear, Escape/outside-click). Use this instead of `<input type="date">` for every visible date field; the native input is only the internal value holder.
- **`src/components/Combobox.tsx`**: searchable select used for the New Sale customer (filters on label and `meta`, e.g. contact number). `ComboOption` is `{ value, label, meta? }`.
- **DR number**: New Sale posts `drNumber` to `create_sale`'s `p_dr_number` (migration `202611150019_sale_dr_number.sql`, already applied). Blank → `next_dr_number(branch)`; typed duplicates in the same branch raise `DR number X is already used in this branch`.

## Sales-In ledger import (2026-11-15)

- **Source**: `C:\Users\jecu2\Downloads\SALES CEBU.xlsx` — 59 sheets, one business day each. A sale starts where **NAME** changes; continuation rows leave DATE/NAME blank, and invoice numbers are only present on some days. The totals/payment notes below or to the right of each block are the day's **expenses already deducted from sales** and were deliberately not imported.
- **Result**: 561 sales, 832 line items, 237 imported customers, ₱56,459,750 / 53,921 bags, 2026-09-07 → 2026-11-14 (cash 450 / gcash 74 / check 13 / bank 24). Everything is in branch **Cebu**.
- **Migration** `supabase/migrations/202611150017_sales_cebu_import.sql` is **already applied to the hosted project**. It adds `sales.import_key` (partial unique index per branch — re-running imports nothing) and `sale_items.source_description` (original sheet wording). It also seeds 9 varieties / 16 SKUs with prices and ends with a call to `import_sales_ledger(branch, rows)`, a security-definer function revoked from anon/authenticated. To import another workbook, generate a new migration in the same shape with fresh `import_key`s.
- **Mapping**: sheet NAME → customer (case-insensitive, branch or shared; created if missing), invoice → `or_number`, generated `IMP-<key>` → `dr_number`, sheet DATE → `sale_date`, one payment row per sale with the method/bank reference, delivery receipt written, balance 0. Stock movements are **not** written for historical sales.
- **Sales history UI** (`src/features/sales/SalesPage.tsx`, `sales.css`): the history card is the Sales-In ledger — Date, Invoice no., Name, Description, Bags, Price, Amount, Cheque, Cash, GCash, DR — with carry-forward blanks for multi-line sales and a TOTAL footer (bags + gross). `Date deposit` and `Bank` were removed (2026-11-15). **Export Excel** writes the same layout to `.xls`. `salesApi.ts` now fetches `source_description` and orders by `sale_date` then `created_at`; the ledger pages 10 rows at a time.

## Split payments — partial GCash, cash remainder (2026-11-15)

- **Why**: the workbook's payment block (below each day's sales) names only the **non-cash** receipts. A customer can therefore be partly GCash and partly cash — on 11/14/2026 MARK DURBAN paid 1,000 GCash + 7,000 cash and ROMEL paid 72,700 GCash + 40,200 cash. The first import turned those into one method per sale, which broke the day's cash on hand.
- **Reading the block**: `GCASH PAYMENT FROM <name>` / `GCASH PAYMENT (<name>)` / `GCASH TO X (FROM Y)` = that customer's GCash part; `CHECK PAYMENT …` / `DEPOSITED TO <bank> …` = check/bank part; `C/O BOSS <amount>` = GCash; every other sale that day is cash; unnamed lump deposits are later bankings of the cash proceeds and are ignored.
- **Migration `202611150018_sales_split_payments.sql`** (already applied): deletes and re-inserts the `payments` rows of 29 imported sales (19 splits) with the components above, keeps the original bank reference per method, sets `sales.payment_type` to the largest component, then replaces `create_sale` with a version that accepts **`p_payments jsonb default null`** — `[{ "method": "cash"|"gcash"|"bank"|"check", "amount": n, "reference": "…" }]`, must sum to the sale total (installments still use the down-payment path).
- **11/14 result**: cash **183,300.00**, GCash **77,720.00** (Mark 1,000 · Shariel 3,480 · Romel 72,700 · C/O BOSS 540), total 261,020.00, balance 0. To re-check any day: sum `payments.amount` grouped by `method` joined to `sales` where `import_key is not null` and `sale_date = …`.
- **UI**: `SalesPage` has a **Cash + GCash** chip (non-installment methods) with a “GCash amount (₱)” field; the cash remainder is derived and shown. History shows `Cash ₱… · GCash ₱…` and Export Excel adds CASH/GCASH (and CHECK/BANK) rows under TOTAL. `salesApi.createSale` takes `payments?: { method; amount; reference? }[]`.
- **Dashboard**: “Cash on hand” now sums **cash** payment rows only (was every method, so it mirrored gross sales), and `src/lib/dates.ts` builds date-only strings from local time instead of UTC — before this, any visit between midnight and 08:00 Manila showed the previous day as “today”. The two top cards also print yesterday's sales/cash under the value.

- **Not corrected / known gaps**: 36 workbook payment lines remain unmatched — the LUZ and M'CORA personal GCash accounts and unnamed lump deposits — so those days' GCash may be understated; named lines on 10/15–10/17 (LUCAS KAPUSUAN, RHINA, BING, JOYLEY) had no matching db sale and were skipped. If the owner wants these attributed, get the customer name for each GCash account.

## Shell responsiveness (2026-11-13)

- Previewing the app in a Mac/laptop browser window showed the phone UI because the desktop breakpoint was 900 px. It is now **720 px**, so desktop screens get a sidebar even when the window is not maximised.
- **720–1099 px**: 88 px **icon rail** — logo, icon-only nav links (labels hidden, `title` tooltip), power-icon sign-out. **≥1100 px**: full 272 px sidebar with labels, branch name and text sign-out. **<720 px**: unchanged phone topbar + bottom tabs.
- Changing the breakpoint means: `src/app/shell.css` (desktop block + new icon-rail media query), `src/app/AppShell.tsx` (`.shell-brand-text`, `.shell-nav-icon`/`.shell-nav-label`, `.shell-signout-icon`/`.shell-signout-label`), `src/styles/tokens.css` (`--page-pad`) and `src/styles/global.css` (`.app-page` padding). Keep these four in sync if the breakpoint moves again.

## Latest pass (2026-11-12): modules + fixes

- **New screens/routes**: `/app/customers` (`CustomersPage`) and `/app/liquidations` (`LiquidationsPage`); nav items added in `src/lib/roles.ts`, icons in `AppShell`, routes in `router.tsx`.
- **Employees**: edit allowed for owner/GA (migration 014 policy); passwords and login emails are System Admin only via `supabase/functions/admin-update-user`.
- **Branches**: lat/lng + geocode + link parser + map preview + edit; `public_branches()` returns coordinates.
- **Containers**: `container_number` column, editable container/supplier form, CSV exports.
- **Sales**: installment down/parts/first-due-date with live 0%-interest schedule; Sales history with date filters, totals, CSV.
- **Fund requests**: liquidation UI removed (use `/app/liquidations`); list export added.
- **Loading**: `AuthContext` memoises `user` on scalar ids and only fetches the profile when the signed-in user id changes. Supabase re-emits `SIGNED_IN` on every browser-tab focus (`_recoverAndRefresh`), which previously remounted every page behind the splash loader; it is now ignored for the same user, so returning to the tab keeps the current page and its data.
- **Session lifetime**: the auth client uses `sessionStorage` (`src/lib/supabase.ts`), so closing the tab/browser requires a fresh login; old `localStorage` tokens are purged on load. `AuthContext` also signs out after five minutes without mouse/keyboard/touch/scroll input, re-checking on visibility change.
- **Migrations to run**: `202611120013_public_site.sql`, `202611120014_branches_containers_accounts.sql`, `202611120015_liquidations.sql`, `202611130016_company_details.sql`. (`202611150017_sales_cebu_import.sql`, `202611150018_sales_split_payments.sql` and `202611150019_sale_dr_number.sql` are **already applied** to the hosted project.)
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
- `202611130016_company_details.sql` — **pending** (fills the placeholder company address/contacts and adds the Angeles City/Cebu/Bohol branch directory; leaves values already edited in Settings untouched)

014 replaces `public_branches()` (adding latitude/longitude), so run it after 013 and the website will use exact pins once branches have coordinates set in Settings → Branches. Until 013 is applied the landing page uses its built-in branch cards, which already list the three official locations.

## Phase 9 build notes

- Table: `inquiries` (name, contact, message, branch_interest, status: new/read/replied/archived, reply_notes, replied_by, replied_at).
- RLS: anonymous INSERT allowed (public can submit); authenticated staff can SELECT + UPDATE.
- Public landing page at `/` — no auth required: hero, brand cards (Kasikas, Super Mama India, Camel India, Mama's Best Super Dinurado, Sweet Daisy Special Sinandomeng, Japonica), 25/50 kg sack sizes, services grid (wholesale/retail, Maxim doorstep delivery, online booking/reservations), Angeles City/Cebu/Bohol branch cards, Phone/Viber + Facebook + address, inquiry form, footer with Staff Login link.
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
