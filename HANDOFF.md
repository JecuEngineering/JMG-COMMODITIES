# JMG System – Agent Handoff

**Last updated:** 2026-11-16 (Inventory Stock list now matches Sales with contained scrolling, sticky headings and scroll reset on paging/filtering; Sales history scrolls inside a viewport-capped container with sticky headings and scroll reset on paging/filtering; Module loading pass — shared 60 s reference cache, stock balances from `v_stock_on_hand`, aggregate dashboard queries, parallel module loads, lazy routes with a splash/skeleton fallback, new indexes migration pending apply; Sales money summary payment totals now share the top-row 1.4rem number size; Sales-In ledger fits the card with no horizontal scrollbar — the three payment tick columns merged into one "Paid via" pill column, text cells wrap, numbers/date/Print DR stay on one line; Price history table uses the new `.ui-table-fluid` so the modal has no horizontal scrollbar; Price history opens in a modal instead of inline below the price list; Set-price modal auto-fills the current price after weight + brand, on top of weight chips and a searchable brand combobox whose list is now portalled; Customers row actions are icon-only pencil/trash buttons under an "Actions" header; Customers row Delete with audit + fixed table columns; Customer list search rebuilt as a toolbar; Customers list scrolls back to its header after paging; Branch scope pill shared and applied above every module title, with a matching pill-shaped `ScopeSelect` branch switcher on Dashboard and Inventory; Dashboard rebuilt to the plan mockup — KPI cards, sales-by-variety bars, stock-on-hand list with OK/Low/Out badges, fund-requests awaiting action with Review/Release; UI foundation pass with design tokens, type scale, shared components, SVG icons, grouped sidebar. Next module pass: Sales. Before that: receipts attachable from the expense list/report tables with View/Replace, exports carry a RECEIPT column of 7-day signed links per row; Expense receipt attachments (photo/PDF), sales history first with the collect-payment moved into a modal, Today/All-dates quick filters; PCF expense sheets with cut/history, sales history color-coded money summary, Liquidations module removed, SKU renamed to Rice variety; Petty cash restructure — Cebu fund ₱50,000, ₱5,000 voucher cap, Vouchers+Expenses merged into one Expenses ledger, liquidation report in the PETTYCASH MONITORING matrix, PCV numbering, November 9–14 Cebu sheet imported (29 vouchers / ₱17,339); `create_sale` accepts `p_payments` and `p_dr_number`; Sales CEBU Sales-In ledger imported — 561 sales / 832 lines / ₱56,459,750; desktop layout from 720 px with an icon rail on laptop/Mac windows; per-tab sessions ending on tab close + 5-minute idle sign-out; official company details on the public site; account editing, branch map pins, container numbers, customers module, installment schedule, CSV exports)

## Inventory Stock list: contained scrolling (2026-11-16)

- `InventoryPage.tsx` wraps only the Stock on hand table in `.inv-stock-list`, a named focusable region with `stockListRef`. The scroll position resets when `balancePager.page`, `balancePager.pageSize` or `filteredBalances` changes, including balance reloads after branch changes. Pagination, filters and the status hint remain outside.
- `inventory.css` uses the same screen-only `min(60dvh, 640px)` cap and sticky headings as Sales. The outer list owns scrolling/border/background; its nested `.ui-table-wrap` has visible overflow and no border to avoid a second scroll container. Short lists shrink, phone columns remain horizontally scrollable, and print height is unrestricted.
- Stock row actions and shared phone row details open portalled modals outside the scroll container. Other Inventory views and all stock ledger/API behavior are unchanged.
- **Verification**: build passes; targeted Inventory lint reports 0 errors and 4 warnings in unchanged code. Actual page tested with local fixture responses at 1280×900 and 390×844: internal keyboard/wheel scrolling and boundary containment, sticky headings, paging/filter/branch resets, short/empty results, phone scrolling/row details, row-action/adjustment dialogs, View movements and return to Stock, and unrestricted print height all passed. Screenshots reviewed; no runtime exceptions or live writes; temporary test assets removed.

## Sales history: contained scrolling (2026-11-16)

- `SalesPage.tsx` makes `.sales-ledger` a named, keyboard-focusable region with `ledgerRef`. Its scroll position resets to the top when `ledgerPager.page`, `ledgerPager.pageSize` or `ledgerSales` changes. Filters, money summaries and pagination remain outside the scrolling region.
- `sales.css` caps the ledger at `min(60dvh, 640px)` with `overflow: auto` and `overscroll-behavior-y: contain`; short lists remain content-sized. The nested `.ui-table-wrap` has visible overflow and no border, while the outer ledger owns the border/background. Keep one scroll container so the sticky `thead th` tracks the ledger rather than an inner wrapper.
- All new layout rules are inside `@media screen`; print output stays unrestricted. Phone horizontal scrolling and the shared Table row-detail modal are unchanged. No changes to shared Table styles or data fetching were needed.
- **Verification**: production build passes; targeted Sales lint has 0 errors and 4 warnings in unchanged code. Actual Sales page tested in headless Chrome with local-only fixture responses at 1280×900 and 390×844. Keyboard/wheel scrolling, boundary containment, sticky headings, TOTAL access, page/page-size/filter resets, short/empty results, phone horizontal scrolling and row details, Print DR, and print height all passed; desktop/phone screenshots reviewed. No live records changed; temporary test assets removed.

## Module loading: cache, aggregates, split routes (2026-11-16)

- **Reference data goes through `cachedQuery`** (`src/lib/queryCache.ts`, 60 s TTL, shares in-flight promises). `fetchBranches()` and `fetchSkus()` are cached under `ref:branches` / `ref:skus` so switching modules no longer refetches them. **Any write to those tables must call `invalidateQuery('ref:branches')` or `invalidateQuery('ref:skus')`** — Products (variety/SKU create + deactivate) and Branches (update/insert/deactivate) already do. Do not add sales, payments, stock or other transactional data to this cache; it would hide new rows after writes.
- **`fetchStockBalances` reads `v_stock_on_hand`**, not `stock_movements`. The view sums the ledger server-side and is the only allowed read path for on-hand quantities; all writes still go through `stock_movements`/RPCs. If the view is missing a column, change the view + migration rather than falling back to client-side summing.
- **The dashboard must stay aggregate-only.** It uses `fetchSalesDayTotals`, `fetchOpenBalanceTotal`, `fetchVarietyTotals` and `fetchCashCollected` from `salesApi.ts`, which push filters (`deleted_at is null`, `status = 'completed'`, branch, date) into PostgREST and return a handful of rows. Never reintroduce a full `sales` select with nested items/payments on the dashboard — that was the main cause of the slow first load.
- **Routes are lazy** in `src/app/router.tsx` (`RootRoute` renders `<Suspense fallback={<SplashLoader/>}>`), and `AppShell` wraps its outlet in `SkeletonTable`. Keep new pages behind `lazy()`; adding an eager import at the top of `router.tsx` pulls that module into the initial bundle (this is what kept it at ~931 kB even after lazy routes were introduced).
- **Indexes migration is not applied yet.** `supabase/migrations/202611160023_performance_indexes.sql` uses `create index if not exists` for the new branch/date/balance filters (sales, sale_items, payments, dues, expenses, fund requests, customers, PCF vouchers, stock adjustments, transfers, shifts). Run `supabase db push` (or paste it into the SQL editor) to get the benefit; until then queries work but scan more.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass (559.67 kB / 162.52 kB gzip initial); `npx oxlint src` 0 errors, 58 known `set-state-in-effect` warnings. New selects probed live → 200. Headless render of the built app confirmed login, landing and the signed-out `/app/sales` redirect. Staff-login timing per module still needs a real account.

## Sales money summary: one number size (2026-11-16)

- `.sales-money-main` and `.sales-money-pay` values now share `font-size: 1.4rem` (22.4 px); previously only the main row was 1.4rem and the payment cards fell back to 1.15rem, which made Cash / GCash / Check look secondary. Under 720 px both rows are 1.2rem (cards become label/value rows).
- Keep the two rows in sync when editing `sales.css` — the payment totals sit directly beneath the main row and any size difference reads as a hierarchy that does not exist. Card label/colour variants (`is-gross`, `is-collected`, `is-due`, `is-clear`, `is-cash`, `is-gcash`, `is-check`) are unchanged.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; computed sizes 22.4 px on both rows with no overflow at 1288 and 960 px, 1.2rem in a 390 px iframe; preview deleted.

## Sales-In ledger fits the card (2026-11-16)

- **Do not re-add the three Cheque/Cash/GCash tick columns.** Each nowrap tick column added 30–40 px of min-content, and with the description floor the ledger's minimum width (1055 px) overflowed ordinary laptop cards. Payment now renders in one **Paid via** cell: `.ledger-pay` (flex, wrap, 4 px gap) containing `.ledger-pay-tag` pills — `.is-check` jade, `.is-cash` gold, `.is-gcash` blue (the same palette as the history money cards). `paymentInfo(sale)` is unchanged; values show only on the sale's first line (`index === 0`), and a sale with no payment shows a muted “—”.
- **Wrapping rules** live in `sales.css`: `.sales-ledger .ui-table td` wraps by default; `.num`, `td:first-child`, `td:nth-child(2)` and `td:last-child` stay `nowrap`. The positional selectors follow the current 9 columns (1 Date, 2 Invoice no., 9 Print DR) — if columns are added or reordered, update them. The unused `.center` rule was removed.
- Cell padding is 8 px horizontally (first/last 14 px) and the table keeps `className="ui-table-fluid"`. The tfoot still spans 4 cells for TOTAL, then Bags / blank Price / Amount, then `colSpan={2}` for Paid via + Print DR.
- **Measured**: min-content 889 px; `clientWidth === scrollWidth` at 1024, 1040, 1100, 1180 and 1288 px. Under ~1000 px the wrapper scrolls sideways by design; phones keep the standard scrollable table and row-tap detail. Don't chase the sub-1000 case by hiding data.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; desktop screenshot and 390 px iframe reviewed with realistic rows; preview files deleted. Live Supabase data not exercised — needs a staff login.

## Tables inside modals: `.ui-table-fluid` (2026-11-16)

- `.ui-table` has a 600 px `min-width` floor for wide list pages. Inside a `md` modal the body is 596 px, so any 4-column table overflows by a few pixels and shows a scrollbar. For small tables in modals/cards add `className="ui-table-fluid"` (`min-width: 0`) so the table shrinks to the container; the price-history table now uses it.
- Keep the floor for list pages (and `.ui-table-fixed`'s 960 px) — those are meant to scroll on narrow screens. On phone the history table still scrolls horizontally, matching other tables.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; probe measured `clientWidth === scrollWidth === 596` inside the modal and screenshots at 1280 px / 390 px confirmed. Preview deleted.

## Price history as a modal (2026-11-16)

- The Price list **View** action sets `historySkuId` only (no more toggle/Hide) and a `Modal` renders while `historySku` resolves, with subtitle `${variety.name} · ${size}kg`, `size="md"`, and a secondary **Close** in the footer. The history table (`Table`) is unchanged; `priceHistory` still filters `prices` by the SKU.
- `historySku` is derived via `skus.find(...)` rather than storing the whole SKU, so a `skus` reload keeps it fresh; close sets `historySkuId` back to `''`.
- Do not reintroduce an inline history block under the list — it moved the pagination and page layout. After **Set price** saves, the modal for the saved SKU opens (same `setHistorySkuId(priceSkuId)` as before) so the new dated row is visible immediately.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; temporary preview (deleted) checked at 1280 px and inside a 390 px iframe. Phone shows the usual horizontally-scrollable table. Live data not exercised — needs a staff login.

## Set price: auto-fill current price (2026-11-16)

- `selectedPrice = useMemo(() => currentPrice(prices, priceSkuId, priceEffectiveFrom), …)` and an effect on `[priceSkuId, selectedPrice]` write `priceAmount` — `price.price.toFixed(2)` (the `Price.price` type is `number`; do not assign it directly to the string-backed input). No SKU selected → the amount is cleared.
- The effect keys off the *resolved Price row*, not the date string, so changing the effective date to a date served by the same row never overwrites a manually edited amount; a different applicable row does.
- `priceHint` under the field reports the source (`Current price ₱… · effective …`) or that no price exists yet. The price/date wrapper uses `stack` (it previously had no gap, which the hint made obvious).
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; temporary preview (deleted) confirmed the 25 kg → Jasmine prefill (`1450.00`) and hint. Live insert not exercised — needs a staff login.

## Set price: weight chips + searchable brand (2026-11-16)

- **Weight**: use `ChipRow` + `Chip` for short option sets instead of a `<select>`; the price modal renders `priceSizes.map(size => <Chip active={priceSackSize === size} …>{size} kg</Chip>)`. Keep the `sr-only` input with `id="price-size"` so the `Field` label still has a target, and put `required` on the `Field` (new `Field` prop → `.ui-field.is-required`) — chips are not native form controls, so the `:has(:required)` asterisk does not fire on its own.
- **Brand**: use the shared `Combobox` (`src/components/Combobox.tsx`) — it already filters by label/meta, supports keyboard nav and `disabled`. Pass `id`, `value` (still the SKU id), `options: { value, label }[]`, `onChange`. It renders the selected label when closed, so no extra display code is needed. Do not drop back to `SelectInput` for long brand lists.
- Because neither control is native-required, `setPrice` now validates `priceSackSize && priceSkuId` and shows “Choose a sack weight, then a brand.”
- **Combobox is now portalled**: its list renders into `document.body` as `.ui-combo-list-portal` (fixed, z-index 450, above the 400 modal backdrop) and positions itself from the input rect, capping height to the viewport and flipping upward when space below is tight. This is what fixed the dropdown being clipped by `.ui-modal-body` (`overflow-y: auto`) under the modal footer — any future combobox/typeahead inside a modal gets the same behaviour for free. Outside-click checks both the wrapper and the portal list (`listRef`), so selecting an option still commits.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; temporary stateful preview (deleted) confirmed chip selection, filtered brand list and portal overlay at 1280 px and a 390 px iframe. Live insert not exercised — needs a staff login.

## Set price: weight first, then brand (2026-11-16)

- In `ProductsPage.tsx` the price form now has `priceSackSize` (`SackSize | ''`) before `priceSkuId`. **Sack weight** options come from `SACK_SIZES` filtered to sizes that exist in `skus`; **Brand** lists `skus.filter(s => s.sack_size === priceSackSize)` sorted by variety name and shows `sku.variety.name` **without** the kg suffix. The brand select is `disabled` until a size is chosen, and changing the size resets `priceSkuId`.
- `prices` still stores the SKU id — do not store size+brand separately; the SKU row is what ties variety and sack size together. If another form ever picks a variety, follow the same weight → brand order instead of a flat “name · size” list.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; a temporary stateful preview (same markup and derivation, deleted) verified the 25 kg → brand list (no “kg” in labels) and screenshots at 1280 px / 390 px iframe. Live insert not exercised — needs a staff login.

## Customers row actions as icons (2026-11-16)

- **Use `.ui-icon-btn`** (in `ui.css`) for icon-only row actions: add it as the `className` on a normal `Button` so the variant still supplies the colour — `variant="secondary"` pencil, `variant="danger"` trash. It overrides the label padding with a 36 px square (48 px `--touch-min` under 720 px) and an 8 px radius. Always set both `aria-label` (with the record name) and `title`, and `event.stopPropagation()` on the click because the row opens the detail card.
- Icons come from `IconName` — `edit` and `trash` were added in `Icon.tsx`; do not use emoji or inline SVG for these.
- **Header**: the action column now has a real `<th>Actions</th>` rather than an empty cell; keep a visible header whenever the column holds buttons.
- **Column split** for the customers table is now 25/17/14/14/15/15 — the Actions share shrank from 20 % because two icons need far less room; Name and Contact gained the difference. If more actions are added later, re-measure the cell instead of guessing.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; header offsets identical across pages at 1280 px and 504 px and the actions cell fits without overflow (preview deleted). Live Supabase path still unverified — needs a staff login.

## Customers: delete + fixed columns (2026-11-16)

- **Delete**: `deleteCustomerRecord(id)` in `customersApi.ts` soft-deletes (`active: false`, `deleted_at`) and returns the timestamp; the page then calls `writeAuditLog({ action: 'delete', tableName: 'customers', … })`. The confirmation modal (`deletingAccount` / `deleteBusy` state) is **blocked** while `account.balance > 0` — the warning tells the user to settle or reassign the sale first. Row buttons must call `event.stopPropagation()` because the `<tr>` opens the detail card.
- **Do not re-add an Open button**: the row click is the way into the customer detail; actions are Edit + Delete only.
- **Fixed columns**: add `className="ui-table-fixed"` to `Table` (now accepts a class) and provide a `<colgroup>` with percentage widths. `.ui-table-fixed` is `table-layout: fixed` with a 960 px floor, so columns do not shift between pages and six columns stay readable on phone (the wrapper scrolls). The current split is in the icon-actions section above.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; headless probe showed identical `th` x-offsets on pages 1 and 2 at 1280 px and 504 px; delete modal screenshotted in allowed and blocked states (preview deleted). Live Supabase delete not exercised — needs a staff login.

## Customer list search toolbar (2026-11-16)

- The search field is no longer a labeled `Field` sitting against the table. Lists that need a filter row should use the shared **`.ui-toolbar`** + **`.ui-search`** pattern (in `ui.css`): a `div.ui-toolbar` with `align-items: center`, 12 px gap, 16 px `margin-bottom`, containing `div.ui-search` (magnifier `Icon name="search"` absolutely positioned at 14 px, `TextInput` with `className="ui-search-input"` for the 40 px left/right padding, and an optional `button.ui-search-clear` with a `close` icon that clears the value) plus the row actions. Use `aria-label` instead of a visible label; **do not** put a `Field` label back — it re-creates the cramped look.
- `type="search"` is used; WebKit's native cancel/decoration pseudo-elements are hidden so only the custom × shows. The icon turns jade on `:focus-within`. Under 520 px `.ui-search` takes the full row and the action button wraps below.
- The Customers empty state now distinguishes “No customers match “…”” from “No customers yet.”
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; 1280 px and 390 px iframe screenshots with empty/filled queries (preview deleted). Not exercised against live data (no staff login).

## Customer list paging keeps the list in view (2026-11-16)

- **`usePaged(items, size, scrollTarget?)`** (`src/components/Pagination.tsx`) takes an optional ref. When the user clicks a page or changes rows-per-page and the target’s top is above the viewport, it scrolls that element to the top after the new rows render. It skips the scroll when the list is already visible, ignores the initial mount, and uses an instant jump when `prefers-reduced-motion` is set.
- **Wiring a list**: `const listTopRef = useRef<HTMLElement>(null)`, pass it as the third argument, and give the list `Card` `ref={listTopRef} className="ui-scroll-target"`. `.ui-scroll-target` supplies `scroll-margin-top` (16 px desktop, `--header-height` + 12 px under 720 px so the card clears the sticky topbar). Currently only the Customers list opts in; the Sales list should adopt the same two lines.
- `Card` now accepts `ref` as a prop (React 19 style) and passes it to its `<section>`.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. A temporary preview using the real `usePaged` + `Card` confirmed page 2 and rows-per-page 25 land the card header at 16 px (desktop) and 76 px (phone) under reduced motion; Chrome headless does not animate smooth scrolls, so the smooth path was not visually observed. Preview deleted.

## Customers module pass (2026-11-16)

- **Header**: the all-branches filter is a `ScopeSelect` next to **Add customer** (the separate “Branch” card is gone); changing it clears the open customer detail. The new-customer hint refers to the branch selected in the header.
- **Summary**: the old “Summary” card is now four KPI cards using the shared `.ui-stats` / `.ui-stat` classes in `ui.css` — Customers, With balance, Total receivables, Overdue. Give a card `className="ui-stat is-warning"` when it needs attention (Overdue uses it when `> 0`); values carry `.num`. The grid is 4/2/1 columns at desktop/≤900/≤480 px.
- Dashboard still uses its own `.dash-metric` classes; prefer `.ui-stat` for new KPI rows outside the Dashboard unless matching its `is-three`/`is-two` variants.

## Branch scope pill (2026-11-16)

- **Use `ScopePill`** (`src/components/ScopePill.tsx`, `.ui-scope` in `ui.css`) as the first child of every module header, above the `<h1>`. With no props it shows `user.profile.branch.name` or `All branches / HQ`.
- **Pick the right label**: branch-scoped pages pass the branch currently being viewed (their own selector); pages that can view everything pass `All branches`; company-wide modules pass `Company-wide` (Employees, Settings, Audit log, Website Inquiries, Products & Prices, Containers). Do not put branch text back in the header subtitle.
- The pill is 12 px caps, jade-mist fill, `--color-jade-muted` border, `--radius-pill`, 15 px `pin` icon; it is intentionally larger than a badge so the active scope is obvious.
- **Glow**: `.ui-scope` runs `ui-scope-glow` (3.6 s infinite) between a faint resting halo and a jade `0 0 20px 4px` halo with a 1.03 scale at 50 %. Colours come from `--color-jade-glow`, `--color-jade-glow-soft` and `--color-jade-soft-bright`. The global `prefers-reduced-motion` rule freezes it on the resting glow, so new pill variants must keep a visible static shadow.
- **Interactive scopes use `ScopeSelect`** (`src/components/ScopeSelect.tsx`, `.ui-scope-select`): pass `value`, `onChange(value)`, `options: { value, label }[]` and `ariaLabel`. It is a custom listbox, not a native select: the pill button opens a styled `.ui-scope-select-panel` under it (selected option on jade-mist with a check), supports ↑/↓/Home/End/Enter/Space/Escape/Tab, closes on outside click and returns focus to the trigger. Used on Dashboard, the Inventory header and the Customers header (next to Add customer); below 720 px both pill and panel go full width. Do not add a new native `<select>` for scope switching.

## Dashboard module pass (2026-11-16)

- **`DashboardPage.tsx`** now follows the mockup: KPI row → `Sales by variety` + `Stock on hand` panels → `Fund requests awaiting action`. Removed the 7-day vertical bar chart, the "Needs attention" list and the upcoming-container fetch; `fetchContainers`/`canViewContainers` are no longer imported here. `canViewInventory` gates the stock fetch/card.
- **Data shaping**: stock balances are aggregated per `sku_id` across the scope (`label = variety · Nkg`, sums of `on_hand`) and sorted out → low → OK; low/out rows surface first. Requests are filtered by `ACTIONABLE[role]` (still the source for reviewer stages), capped at 6 rows, with status text from `REQUEST_STATUS` (`submitted`/`forwarded`/`approved` → Waiting on accounting / Waiting on owner / Ready to release).
- **Phone**: `.dash-requests` (table) is hidden under 720 px and `.dash-requests-list` cards render instead (`dash-request-card` grid: purpose + amount, requester · branch, badge). Branch column hides under 1024 px, requester under 900 px. KPI cards go 2-up under 1240 px and 1-up under 560 px; panels stack under 960 px.
- **Metrics gating**: Today's sales / Cash on hand / Customer balances require `canViewSales`; Petty cash requires `canViewPcf`, so a `cashier` sees 3 cards and `warehouse` none (previously zeros were shown). The metrics grid has `is-three`/`is-two` variants.
- **Amount formatting**: `formatPhp` for card/table values, `compactPhp` only for the "yesterday" sub-lines and bar labels, `Intl` integer formatting for sacks. Every amount carries `.num` for tabular figures.
- **`Field.tsx` fix**: `TextInput`, `SelectInput`, `TextArea` now merge a passed `className` into `ui-input` (previously the custom class replaced it, dropping input styling — this is what left `.dash-branch-pick` unstyled).
- **Branch scope chip**: the shared `ScopePill` sits above the title and receives `scopeLabel` — the user's branch, or `All branches`/the selected branch for owner and GA. Keep branch context here rather than in the subtitle; the subtitle is only `Today · <date>`.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Visual check at 1280 px and a 390 px iframe with representative data via a temporary preview entry (deleted). No staff login, so live authenticated data was not exercised.

## UI foundation pass (2026-11-16)

- **How to style new UI**: use tokens from `src/styles/tokens.css` — never hardcode a hex colour, radius, shadow or spacing value in a feature stylesheet. Type sizes are `--text-2xs` (11 px caps/labels) through `--text-2xl`; page titles use `--text-display`. Spacing is `--space-1…16` (4/8/12/16/20/24/32/40/48/64). Cards are `--radius-card` (16 px) with a 1 px `--color-border`, no heavy shadow; controls are `--control-h` (44 px desktop, 48 px phone) at `--radius-control`; touch targets never below `--touch-min` (48 px) on phone. Money/quantity cells get `className="num"` (or `.money`) for tabular figures; right-align them.
- **Icons**: use `import { Icon } from '../../app/Icon'` and `<Icon name="…" />` — do not add emoji icons. `IconName` = every `NavItemId` plus `bell`, `close`, `menu`, `power`. Stroke is 1.7 and `currentColor`, so colour comes from the parent.
- **Navigation groups**: `NavItem.group` in `src/lib/roles.ts` places items in `Overview · Sales & Customers · Stock · Finance · Admin`; `groupedNav()` drops empty groups. Adding a nav item means setting both `roles` and `group`; a new group needs an entry in `NAV_GROUPS` and a display slot in `groupedNav`.
- **Table density**: `.ui-table` uses `--row-y` 10 px on desktop and `--row-y-phone` 13 px on phone; the shared `Table` opens a row-details modal on phone. Keep new tables inside `.ui-table-wrap` (or another `overflow-x: auto` box) — the shell depends on it to stay 390 px wide.
- **Known gap**: no staff test login was available in the in-app browser, so the authenticated shell was verified with a temporary static harness at 1200 px and 390 px (since deleted). Next pass (Dashboard) should be verified in the real app if a login is provided.
- **Verification for this pass**: `npx tsc -b --force` and `npx vite build` clean; login and landing rendered at both widths.

## Phone row details (2026-11-15)

- `src/components/Table.tsx` is now phone-aware: at `max-width: 719px` (`matchMedia`, updated on rotation) tapping a `<tbody>` row opens a `Modal` whose `dl.ui-row-detail` lists every non-empty cell with its `thead` label. The title combines the first name/payee/description and PCV/invoice/DR/OR/ref values (`ALDERI · AC-1991`). Taps on buttons/links/inputs inside the row are ignored so per-row actions still work; totals rows are skipped. No page-specific code — every module that uses `Table` gets it. Styles: `.ui-row-detail*` and `cursor: pointer` on phone rows in `ui.css`.

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
