# Changelog

## Inventory stock list scrolls inside its container (2026-11-16)

- The Stock on hand list now matches Sales: a single scroll region capped at `min(60dvh, 640px)`, sticky column headings, and contained wheel/keyboard scrolling. Filters, pagination and the stock-status hint stay outside the list.
- Paging, page-size changes and filtered balance updates reset the list to the top. Short/empty results retain their natural layouts, phone horizontal scrolling is preserved, and screen-only rules leave print height unrestricted. Movements, transfers, adjustments, stock APIs and ledger writes are unchanged.
- **Verification**: `npm run build` passes; targeted Inventory lint reports 0 errors and 4 warnings in unchanged code. Headless Chrome tested the actual Inventory page with 62 local fixture stock lines at 1280×900 and 390×844: keyboard/wheel scrolling, boundary containment, sticky headings, page/page-size/status/variety/branch resets, short/empty lists, phone horizontal scrolling and row details, row-action and adjustment dialogs, movement navigation, return to Stock, and print height passed. Screenshots reviewed; no runtime exceptions or live writes. Temporary test assets removed.

## Sales history scrolls inside its container (2026-11-16)

- The Sales-In ledger now has its own vertical scroll area, capped at `min(60dvh, 640px)`, instead of growing the page with every line item. Column headings stay pinned at the top; filters, money summaries and pagination remain outside the scroll area.
- The existing `.sales-ledger` is the single scroll container; its inner table wrapper no longer creates a second scrolling layer. Wheel scrolling stays inside the list at its boundaries, keyboard scrolling is supported through a named focusable region, and narrow screens retain horizontal access to all columns.
- Changing the page, page size or filtered sales resets the list to the top. Short lists shrink naturally and empty filters keep the existing empty state. Height constraints and sticky headings are screen-only, so printing is not clipped; no shared tables or data queries changed.
- **Verification**: `npm run build` passes; targeted Sales lint reports 0 errors and 4 warnings in unchanged code. Headless Chrome exercised the actual Sales page with isolated fixture responses at 1280×900 and 390×844: internal keyboard/wheel scrolling, boundary containment, sticky headings, TOTAL access, paging/page-size/filter resets, short/empty lists, phone horizontal scrolling and row details, Print DR, and unbounded print layout all passed. Screenshots reviewed; no runtime exceptions or live database writes. Temporary test assets removed.

## Faster module loading: lighter queries, shared cache, split routes (2026-11-16)

- **Why it was slow**: every module downloaded far more than it displayed. The dashboard pulled all 561 sales with their items, payments, customers and varieties, then summed stock by downloading every `stock_movements` row; Sales, Inventory, Products and Reports each re-fetched branches and SKUs on mount with sequential awaits; Reports loaded every expense and an unbounded shift list. The whole app also shipped as one eager bundle, so the first screen waited for code it never used.
- **Reference data cache** (`src/lib/queryCache.ts`): `cachedQuery(key, fetcher, ttlMs = 60s)` keeps results and in-flight promises across pages; `invalidateQuery(prefix)` clears them. `fetchBranches()` / `fetchSkus()` now cache under `ref:branches` / `ref:skus`, and Products (variety/SKU create, deactivate) and Branches (update/insert/deactivate) invalidate the matching prefix after a write. Transactional data is never cached.
- **Stock balances** now read the `v_stock_on_hand` view (`branch_id, sku_id, on_hand`) instead of downloading the movement ledger and summing in the browser; branch scoping happens in the query. Writes still go through `stock_movements` only — the view is read-only.
- **Sales** (`salesApi.ts`): the list select drops unused branches and payment columns. New aggregate helpers replace full-table reads — `fetchSalesDayTotals` (per-day totals since a date), `fetchOpenBalanceTotal` (sum of balances + count), `fetchCashCollected` (cash payments for specific dates via an `!inner` sale join) and `fetchVarietyTotals` (top 5 varieties in the last 7 days). The dashboard now issues only aggregates and never holds the sales history in memory.
- **Parallel loads**: Sales, Inventory, Products, Reports and the dashboard start their independent queries together; Reports applies the branch filter and `limit(200)` on shifts in the query, and the double branch fetch on mount is gone.
- **Code splitting**: every page (including Login and Landing) is a `lazy()` route under a `RootRoute` `<Suspense>` splash, and `AppShell` wraps its outlet in a skeleton fallback. The initial bundle fell from ~931 kB to 559.67 kB (162.52 kB gzip); the landing page is its own 136 kB chunk.
- **Indexes**: `supabase/migrations/202611160023_performance_indexes.sql` adds `if not exists` indexes matching the new filters — sales by branch/date and open balances, sale_items, payments by sale/date/method, installment dues, expenses, fund requests, customers, PCF vouchers, stock adjustments, transfers and shifts. **Not yet applied to the database** — run it with `supabase db push` or paste it into the SQL editor.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; `npx oxlint src` reports 0 errors (58 pre-existing `set-state-in-effect` warnings). All new selects were probed against the live project and returned 200 (variety totals, cash inner join, `v_stock_on_hand`, day totals, open-balance filters). A headless render of the production build confirmed `/login`, `/` and the signed-out `/app/sales` redirect all paint from their split chunks. Live staff-login timings still need a real account.

## Sales summary: payment figures sized like the top row (2026-11-16)

- The Cash / GCash / Check totals rendered at 1.15rem while Gross / Collected / Balance were 1.4rem, so the payment row looked undersized. Both rows now use 1.4rem (22.4 px); under 720 px both rows use 1.2rem, where cards switch to a label/value row.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Computed sizes matched (22.4 px / 22.4 px) with no overflow at 1288 and 960 px using the real figures (e.g. ₱29,215,825.00 cash), and a 390 px iframe showed both rows at 1.2rem. Temporary preview deleted.

## Sales ledger fits the card, no scrollbar (2026-11-16)

- The Sales-In ledger packed 11 columns and forced every cell to one line, so its minimum width (~1055 px) beat the card (~1092 px only on wide screens) and a horizontal scrollbar sat under the TOTAL row at common laptop widths.
- The three tick columns (Cheque / Cash / GCash) are now one **Paid via** column with compact coloured pills — jade for Cheque, gold for Cash, blue for GCash. Payments belong to the sale, so the pills appear on the sale's first line only; a sale with no payment shows “—”.
- Description and Name may wrap; dates, invoice numbers, quantities, amounts and **Print DR** stay on one line. The 170 px description floor and the blanket `white-space: nowrap` are gone, and cell padding dropped from 10 to 8 px (14 px on the outer edges). The table keeps `.ui-table-fluid`.
- **Measured**: minimum table width fell from 1055 px to 889 px; probes show `clientWidth === scrollWidth` at 1024, 1040, 1100, 1180 and 1288 px windows — no scrollbar. Below ~1000 px the wrapper scrolls horizontally as before, which is intentional for very narrow windows.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Screenshot at 1288 px shows wrapped descriptions, left-aligned pills, valid totals (53,921 bags · ₱56,459,750.00) and the TOTAL row aligned; a 390 px iframe keeps the usual scrollable table (row tap still opens details). Temporary preview deleted; live data not exercised — needs a staff login.

## Price history modal fits its width (2026-11-16)

- The history table carried the shared `.ui-table` floor of 600 px while the `md` modal body gives 596 px, so a horizontal scrollbar appeared under four short columns for a 4 px overflow. New shared `.ui-table-fluid` (`min-width: 0`) lets small tables shrink to their container; the price-history table uses it and the modal now measures 596 px of table in 596 px of body — no scrollbar.
- Other tables keep the 600 px floor (and `.ui-table-fixed` keeps 960 px) so wide lists still scroll rather than squeeze. Phone still shows the four columns in a horizontally swipeable table, as with other wide tables.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Headless probe confirmed `clientWidth === scrollWidth === 596`; screenshot at 1280 px shows no scrollbar, and a 390 px iframe keeps the standard scrollable table. Preview deleted.

## Price history opens in a modal (2026-11-16)

- **View** in the Price list no longer expands a history section under the table (which pushed the pagination and the rest of the page around). It now opens a **Price history** modal for that row, titled with the variety and sack (`Jasmine · 25kg`), showing effective date, price, who set it, and when it was recorded, with a Close button.
- The modal reuses the existing `Modal` + `Table`; the history query (`priceHistory`) and `historySkuId` state are unchanged, and saving a new price still opens that SKU's history so the new row is visible immediately.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Temporary preview (deleted) rendered the modal at 1280 px and inside a 390 px iframe; the four columns scroll horizontally on phone like other wide tables. Live data not exercised — needs a staff login.

## Set price: auto-fill the current price (2026-11-16)

- After a weight and brand are chosen, **Price per sack (₱)** fills itself with that SKU's current price for the selected effective date (via the existing `currentPrice` lookup), formatted to two decimals. The field stays editable so the new price can be typed over it.
- A hint below the field says where the number came from: `Current price ₱1,450.00 · effective Nov 13, 2026`. When the brand has no price on file, the field clears and the hint reads “No price on file for this brand and weight yet.”
- Switching weight, brand or effective date re-checks the price list; when the applicable price row is unchanged, a price the user already edited is left alone.
- The price/effective fields were sitting in an unstyled wrapper with no gap; it now uses `stack` so the hint and the date field are spaced like the rest of the form.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Temporary preview (deleted) selected 25 kg → Jasmine and confirmed `1450.00` in the field with the effective-date hint. Live Supabase insert not exercised — needs a staff login.

## Set price: weight chips + searchable brand (2026-11-16)

- **Sack weight** in the *Set new price* modal is now a row of chips (`5 kg` / `25 kg` / `50 kg`, only weights that have varieties) built from the shared `Chip`/`ChipRow`, so the weight is one tap instead of a select.
- **Brand** is now a searchable `Combobox` (the same control as the customer field on New Sale): type a few letters and the list filters immediately. Labels stay brand-only, the control is disabled (“Choose weight first”) until a weight is tapped, and picking a different weight clears the brand.
- Submitting without a weight/brand now shows “Choose a sack weight, then a brand.” instead of failing silently. `Field` gained an optional `required` prop (`.ui-field.is-required`) to keep the red asterisk on fields without a native required control.
- **Combobox fix**: its list is now portalled to `document.body` with fixed positioning (`.ui-combo-list-portal`, z-index 450). Inside a modal the old absolutely-positioned list was clipped by the scrolling modal body — the price dropdown was cut off under the footer. It measures the input, caps its height to the viewport and flips above the field when there is not enough room below. This also benefits the New Sale customer combobox.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Probe confirmed the 25 kg chip becomes active and typing “ja” filters the brand list to Japonica / Jasmine / Kasikas Jasmine. Screenshots at 1280 px (list overlays the modal cleanly) and inside a 390 px iframe (list flips upward, chips stay on one row). Temporary preview deleted; live insert not exercised — needs a staff login.

## Set price: pick sack weight, then brand (2026-11-16)

- The **Rice variety** dropdown in the *Set new price* modal is split into two steps: **Sack weight** (`5 kg` / `25 kg` / `50 kg`, limited to weights that have varieties) and then **Brand**. The brand select stays disabled and reads “Choose weight first” until a weight is picked.
- Brand options are the variety name only — the weight is no longer repeated beside it, because the weight is already the first choice. Changing the weight clears the chosen brand, since the brands list changes with it.
- The saved value is still the SKU id, so `prices` rows, history and “old sales keep their old price” behave exactly as before.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Temporary preview (deleted) confirmed the 25 kg selection enables Brand with a kg-free, name-sorted list, and screenshots at 1280 px and inside a 390 px iframe show both selects full width. Live Supabase insert not exercised — needs a staff login.

## Customers row actions as icons + Actions column header (2026-11-16)

- **Edit** and **Delete** are now icon-only buttons (pencil and trash, new `edit` / `trash` icons in `Icon.tsx`) instead of text buttons, and the action column finally has a header: **Actions**.
- New shared `.ui-icon-btn` in `ui.css`: 36 px square on desktop, 48 px (`--touch-min`) on phone, 8 px radius. It is applied on top of the existing button variants, so the pencil stays secondary and the trash stays danger red. Each button keeps `aria-label="Edit <name>"` / `aria-label="Delete <name>"`, a `title` hover hint, and `event.stopPropagation()` so the row detail does not open.
- Column split changed to 25/17/14/14/15/15 % (was 22/15/15/14/14/20) — the old 20 % Actions column was oversized for two icons, and the reclaimed width goes to Name and Contact.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Headless probe showed identical header x-offsets on pages 1 and 2 at 1280 px (85/358/544/697/849/1013) and 504 px; the actions cell fits both buttons without scrolling (136 px client at 1280, 120 px at the 960 px floor). Desktop screenshot reviewed; narrow screenshot confirms the table scrolls as before. Temporary preview deleted. No staff login, so live data was not exercised.

## Customers: delete action + columns fixed across pages (2026-11-16)

- **Row actions**: the **Open** button is gone — the row itself already opens the customer detail. **Edit** stays and a danger **Delete** was added (both stop the row click so the detail card does not also open).
- **Delete** is a soft delete: `deleteCustomerRecord` sets `active = false` and `deleted_at`, then the page writes an `audit_log` entry (`action: delete`, old/new values). A confirmation modal names the customer; when the account still has an open balance the modal shows the amount and disables **Delete customer**, so receivables cannot be hidden by accident. Existing sales, payments and receipts are untouched.
- **Stable columns**: the customer table is now `table-layout: fixed` (`.ui-table-fixed`) with a `colgroup` (22/15/15/14/14/20 %). Column positions no longer jump when the content of a new page is wider or narrower. `Table` accepts an optional `className`. The fixed table has a 960 px floor so the six columns stay legible on phones (it scrolls horizontally, same as other wide tables).
- **Verification**: `npx tsc -b --force` / `npx vite build` pass. Headless probe measured identical header x-offsets on pages 1 and 2 at 1280 px and 504 px; the actions cell fits Edit + Delete (190 px content at 1280, 168 px at the 960 px floor). Delete modal checked in both allowed and blocked states; temporary preview deleted. No staff login, so the Supabase write path was not exercised live.

## Customer search rebuilt as a list toolbar (2026-11-16)

- **Why**: the Search input sat directly against the table header, with a form-style label tucked under the card divider, so the filter read as part of the list instead of a control above it.
- The list now starts with a `.ui-toolbar` row: a 44 px search box with an in-field magnifier icon, the placeholder “Search name, contact, or address”, and a circular × that clears the query once anything is typed. **Export CSV** is height-aligned beside it, and 16 px separates the toolbar from the table header.
- The icon tints jade while the field is focused; native WebKit search decorations are hidden; under 520 px the search takes the full row and Export CSV wraps beneath it.
- Searching with no hits now reads `No customers match “…”` instead of “No customers yet.”
- Added a `search` icon (`Icon.tsx`); the styles (`.ui-toolbar`, `.ui-search`, `.ui-search-icon`, `.ui-search-input`, `.ui-search-clear`) live in `ui.css` and are generic for other list pages. The visible “Search” label was dropped in favour of `aria-label="Search customers"`.
- **Verification**: `npx tsc -b --force` / `npx vite build` pass; rendered at 1280 px and inside a 390 px iframe with an empty and a filled query (temporary preview, deleted).

## Customer list keeps its place when paging (2026-11-16)

- **Why**: clicking a page button at the bottom of the customer list swapped the rows above it, but the viewport stayed on the pagination bar — the new page was off-screen.
- `usePaged` (`src/components/Pagination.tsx`) accepts an optional `scrollTarget` ref. When the user changes page or rows-per-page and the list header has scrolled above the viewport, it scrolls back to the list after the rows render. No scroll is performed when the list is already visible, and `prefers-reduced-motion` swaps the smooth glide for an instant jump.
- The target uses the new shared `.ui-scroll-target` (`scroll-margin-top`: 16 px desktop, sticky-header offset + 12 px on phone) so the card title clears the mobile topbar. `Card` now forwards a `ref` (React 19 ref-as-prop) so the Customer list card itself is the anchor.
- Applied to the Customers list only; other modules can opt in by passing a ref as the third `usePaged` argument.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass. Headless Chrome probe (temporary preview, deleted) confirmed page 2 and rows-per-page 25 both land the list header at 16 px on desktop and 76 px on phone, and that no scroll happens when the list already fits the viewport.

## Customers summary as KPI cards (2026-11-16)

- The plain “Summary” card (a title plus four bare numbers) is now a row of four stat cards matching the Dashboard: **Customers**, **With balance**, **Total receivables** and **Overdue**, each with a lowercase context line (“Records in this view”, “No open balances”, “Open sale balances”, “Nothing overdue”).
- The **Overdue** card turns amber (fill + border) and reads “Needs follow-up” as soon as the count is above zero; amounts use tabular figures so they align.
- New shared classes `.ui-stats` / `.ui-stat` (+ `.is-warning`, label/value/sub) in `ui.css`: 4-up on desktop, 2-up under 900 px, 1-up under 480 px. Other modules can reuse them for KPI rows.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; both zero and non-zero states rendered at 1000 px and inside a 390 px iframe (temporary preview, deleted).

## Customers branch filter moved into the header (2026-11-16)

- **Why**: the all-branches filter was a lone full-width native select inside its own "Branch" card, which pushed the customer list down a screen and looked nothing like the Dashboard/Inventory switchers.
- **Now**: the card is gone. The `ScopeSelect` pill sits in the Customers header next to **Add customer**, and selecting a branch updates both the glowing scope pill and the list (clearing any open customer detail). Roles fixed to one branch see no switcher, as before.
- The new-customer modal hint now reads “Saved to the branch selected in the header.”
- **Verification**: `npx tsc -b --force` passes; header rendered at 1000 px and inside a 390 px iframe (temporary preview, deleted). On phone the switcher spans the width with the action wrapping beneath it.

## Branch pill glow (2026-11-16)

- The scope pill above each page title now breathes: a 3.6 s `ui-scope-glow` animation cycles a soft jade halo (`0 0 20px 4px` at peak), lifts the border to a translucent jade and brightens the fill, with a 1.03 scale — enough to catch the eye on the cream background without behaving like an alert.
- New tokens `--color-jade-glow`, `--color-jade-glow-soft` and `--color-jade-soft-bright`; the resting state keeps a faint 6 px glow, so `prefers-reduced-motion` users get a static highlighted pill instead of movement.

## Branch switcher redesigned (2026-11-16)

- **Why**: the Dashboard's `All branches` control was a full-height form select with the browser's default arrow, so it read as an empty field competing with the title instead of a deliberate scope switcher.
- **New `ScopeSelect`** (`src/components/ScopeSelect.tsx`, `.ui-scope-select` in `ui.css`): a white pill at `--control-h` with a jade pin, 15 px semibold label and a custom chevron — the interactive twin of the `ScopePill`. It no longer uses the OS select menu: clicking opens a styled white panel (elevated shadow, 10 px radius) with the branch list, the current option on jade-mist with a checkmark, and arrow-key hover highlighting.
- **Interaction**: click the pill to open/close; click an option to apply and close; click anywhere outside to dismiss; Escape closes and returns focus to the pill. Keyboard: ↓/↑ open and move, Home/End jump, Enter/Space select, Tab closes. The trigger is a real button with `aria-haspopup`/`aria-expanded`; the panel is a `role="listbox"` with `aria-activedescendant`.
- **Applied**: Dashboard header and the Inventory header's all-branches filter (replacing `.dash-branch-pick` and `.inv-branch-pick`). Under 720 px the pill and its panel span the content width.
- Added `chevron-down` and `check` icons to `src/app/Icon.tsx`.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; rendered open at 1000 px and inside a 390 px iframe. Clicked through in a browser: built-in select click applies the branch and closes, arrows + Enter select, Escape and outside clicks close with focus restored.

## Branch scope pill on every module (2026-11-16)

- **Shared component**: the jade scope chip from the Dashboard is now `src/components/ScopePill.tsx` (styles `.ui-scope` in `ui.css`). It defaults to the signed-in user's branch (`All branches / HQ` when they have none) and accepts a `label` override.
- **Bigger**: 12 px caps text (was 11 px), 4 px × 12 px padding, 15 px pin icon, jade-mist fill with a `--color-jade-muted` border — noticeable above every page title without competing with it.
- **Every module**: the pill sits above the `<h1>` on Dashboard, Sales, Inventory, Petty cash, Customers, Reports, Fund Requests, Containers, Products & Prices, Employees & Roles, Settings, Audit log, Website Inquiries, Me and the placeholder screens.
- **Honest scope**: branch-scoped screens show the branch they are viewing (Sales/PCF/Customers/Reports/Dashboard/Inventory follow their selector); Fund Requests shows `All branches` for Owner/GA; company-wide modules (Employees, Settings, Audit log, Website Inquiries, Products & Prices, Containers) read **Company-wide** instead of implying branch filtering. Redundant branch text was dropped from the Sales and Petty cash subtitles, and Inventory's separate read-only branch label was removed.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; the pill was rendered at 1000 px and inside a 390 px iframe (temporary preview entry, deleted afterwards). No staff login, so authenticated screens were not clicked through.

## Dashboard rebuilt to the plan mockup (2026-11-16)

- **Layout**: header (`All branches · Today · <date>` + branch selector), four KPI cards, then **Sales by variety** (last 7 days, horizontal bars with the week total) beside **Stock on hand** (sacks per variety with **OK / Low / Out** badges, six rows, **View all**), and finally **Fund requests awaiting action** with a **Total** row and **View all** — matching `PLAN/Dashboard (laptop)@2x.png`.
- **Fund requests**: rows show purpose, requester, branch (when viewing all branches), amount, a workflow badge — **Waiting on accounting** (submitted), **Waiting on owner** (forwarded), **Ready to release** (approved) — and a **Review/Release** link. The card subtitle lists the stage(s) actually present. Below 720 px the table becomes tappable cards (purpose + amount, requester · branch, status) so nothing is cut off.
- **Metrics**: petty cash turns amber (border + background + "Replenish soon") when any fund is low; customer balances show the overdue-installment count in amber when there is one; sales/cash cards show yesterday as a compact value. KPI cards only render for roles that can see the data (warehouse no longer sees empty sales figures).
- **Stock aggregation**: balances are summed per SKU across the selected scope and sorted out → low → OK, so shortages surface first. The dashboard no longer shows the "Needs attention" list (the notification bell covers it) or an upcoming-container item (remove `fetchContainers` from this page); the **Sales, last 7 days** bar chart was replaced by the mockup's variety bars + stock list.
- **Shared input fix**: `TextInput` / `SelectInput` / `TextArea` merged a passed `className` with `ui-input` instead of replacing it, so the dashboard branch selector and any other customised field keep their styling.
- **Branch scope chip**: the active branch now sits as a jade pill with a location pin above the **Dashboard** title (`Cebu branch`, or `All branches` / the selected branch for owner and GA), and the subtitle is just `Today · <date>`. Fixed-branch roles no longer rely on the muted subtitle or the sidebar footer to know where they are. New `pin` icon in `src/app/Icon.tsx`.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass. Rendered the new layout at 1280 px and inside a 390 px iframe with representative data (temporary preview entry, deleted afterwards). **Authenticated data was not clicked through** — no staff login is available in the in-app browser.

## UI foundation pass — tokens, type, shared components, grouped sidebar (2026-11-16)

- **Goal**: stop UI drift before per-module polishing. The CSS had reached ~4,900 lines across 9 files with 39 hardcoded hex colours, no spacing/type scale, and card/shadow styles that no longer matched the plan mockups (20 px radii, heavy shadows vs. flat 16 px cards with a 1 px border).
- **Design tokens** (`src/styles/tokens.css`, rewritten): one source for colour (warm off-white `#f6f3ec`, jade `#1f6b58`, ink ramp with `--color-ink-faint` at 4.8:1 on white), a type scale (`--text-2xs` … `--text-2xl` + fluid `--text-display`), spacing `--space-1…16`, radii (`--radius-card: 16px`, `--radius-control: 10px`, pill), two shadows (card / elevated), focus ring, and layout metrics (`--sidebar-width`, `--header-height`, `--bottom-nav-height`, `--content-max`, `--page-pad`, `--row-y`, `--control-h`, `--touch-min`).
- **Global typography** (`src/styles/global.css`): body text 15 px on a 1.55 line-height, explicit h1–h4 sizes, tighter display tracking, `::selection` in jade, and `.num`/`.money` with tabular figures so money columns align. Emoji status icons in `.empty-state`, `.error-banner`, `.success-banner` replaced with inline SVG masks.
- **Shared components** (`src/components/ui.css`): buttons at `--control-h` with 1 px borders and a single primary tint; cards at 16 px radius and token padding; inputs with hover/disabled/focus-ring states and 16 px font on phone (iOS no longer zooms); chips 36/40 px; badges 22 px; tables use one row rhythm (`--row-y 10px` desktop, `--row-y-phone 13px` phone), tabular numbers and a right-aligned `.num` cell; combo/date/pager/modal all tokenised.
- **Icon system** (`src/app/Icon.tsx`, new): 18 line icons (1.7 stroke) for every nav destination plus bell/close/menu/power, rendered by one `<Icon name size />` component. Emoji icons are gone from the shell and the notifications bell.
- **Grouped navigation** (`src/lib/roles.ts`, `src/app/AppShell.tsx`, `src/app/shell.css`): nav items carry a `group` (`Overview`, `Sales & Customers`, `Stock`, `Finance`, `Admin`); `groupedNav()` drops empty groups per role. The sidebar, phone drawer and icon rail all render group labels; rail hides labels and separates groups with a divider. Nav links are 40 px at `--radius-control` with jade active icons and a left active bar; sign-out is a bordered row at the sidebar foot.
- **Notifications** (`NotificationsBell.tsx`): bell/close icons from the new set; panel styling unchanged in behaviour.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass (CSS 78.35 kB → 14.01 kB gzip). Login and landing pages rendered at 1200 px and 390 px in the dev browser. The authenticated shell (grouped sidebar, metric cards, phone rows) was checked with a throwaway static harness at 1200 px and 390 px using the new tokens/components — it was deleted afterwards. **No staff login is available in the in-app browser, so the real authenticated screens were not clicked through**; this pass is verified visually via the harness only.

## Tap any table row on a phone to see every field (2026-11-15)

- **Why**: wide tables (Sales ledger, Petty cash, Inventory, …) need sideways scrolling on a phone, so the row you are reading scrolls out of view.
- **What**: the shared `Table` component detects phones (`max-width: 719px` via `matchMedia`) and a tap on any data row opens a **Row details** modal with every non-empty field as a label/value pair (e.g. `ALDERI · AC-1991`, then Date, Invoice, Name, Description, Bags, Price, Amount, Receipt). One change covers every module and list that uses `Table`; tablet/desktop rows are untouched.
- **Buttons still work**: taps on a button/link/input inside a row (View, Attach, Replace, Edit, …) are ignored by the row handler, so those keep their own action. Totals rows are not clickable.
- **Verification**: rendered a sample table in the dev server at a phone width, tapped a row (modal opened with all values), confirmed the title picks name + reference, and confirmed tapping the row's **View** button does not open the details.

## Mobile layout no longer zooms out on Sales and Petty cash (2026-11-15)

- **Cause**: `.shell` used a `1fr` grid column, whose automatic minimum is the widest child. The 11-column Sales-In ledger (and the 1080 px PCF matrix) made the page ~1025 px wide on a 390 px phone, so the mobile browser shrank the whole UI and it looked like the tablet/desktop layout after switching modules. The receipt/description cells had the same effect on Petty cash.
- **Fix**: the shell now uses `minmax(0, 1fr)` (mobile and the desktop content column) and `.shell-main`/`.shell-content` get `min-width: 0`. Wide tables scroll inside `.ui-table-wrap` / `.pcf-matrix-wrap` instead of stretching the page; verified with a 390 px harness — `scrollWidth` dropped from **1025 → 390**.
- **Forms**: `.ui-input` is 16 px below 720 px so iOS no longer zooms in when a field gets focus.
- **Sales money summary**: below 720 px the six cards stack one per row with the label and value on a single line, so `₱56,459,750.00` no longer spills into the neighbouring card.

## New fleet photo on the landing page (2026-11-15)

- The **Our fleet** section background is now `public/JMG FLEET.jpg` (white Isuzu Giga loaded with assorted rice sacks) in place of `JMG TRUCKS.jpg`. Only `.pub-trucks-bg` in `src/features/website/website.css` changed; the landing hero and the login screen keep the original trucks photo.
- **Verification**: checked in the dev server — `/JMG%20FLEET.jpg` returns 200 and renders behind the existing dark gradient with the section copy still legible.

## Receipts attachable from the expense list and aligned in exports (2026-11-15)

- **Attach from the list**: the Expenses **Receipt** column (and the recent-voucher list and sheet-history modal) now shows **Attach** for a voucher without a receipt and **View · Replace** when one exists. Picking a photo or PDF uploads it to `pcf-receipts`, writes `pcf_vouchers.receipt_path` and refreshes the list, so the imported November vouchers can get their receipts without re-entering the expense.
- **Exports carry the receipt**: `downloadExcel`/`downloadCsv` accept link cells (`{ text, href }`); **Export Excel** writes a real hyperlink and **Export CSV** writes the URL. Both the expense exports and the liquidation-matrix export gained a **RECEIPT** column on the same row as the expense — "No receipt" when missing, a **View receipt** link (7-day signed URL) when present, so rows stay aligned instead of receipts being a separate pile.
- **Receipts open in a modal**: `ReceiptPreview` (`src/features/pcf/ReceiptPreview.tsx`) shows the signed receipt inside the app instead of a new browser tab — images render as an `<img>`, PDFs in an embedded frame, with **Open in new tab** and **Close** in the footer. The expense list, recent vouchers, sheet history, report receipt links and the Request for Fund receipt list all use it.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; the link-cell export format was built locally. Attaching a live file and opening the exported workbook were not exercised (no staff login / file picker in the agent browser).

## Expense attachments, sales history first, Today filter, collect-payment modal (2026-11-15)

- **Expense receipt attachment**: the PCF expense form now has a proper **Attachment (receipt)** field — photo or PDF, with the chosen file name, **Replace** and **Remove**; the old bare "Receipt photo" input is gone. Files are uploaded to `pcf-receipts` with a sanitized name and still open through the receipt **View** links in the ledger, sheet history and report.
- **Sales history first**: the **Collect installment payment** card no longer sits above the history. It is now a **Collect payment** button in the Sales header that opens a small modal (sale with balance, amount prefilled with the balance, method), and the history card is the first thing on the Sales tab.
- **Today quick filter**: the sales-history filter row has **Today** (sets From and To to today, highlighted while active) and **All dates** (clears both). Export Excel always writes the filtered ledger, so Today → Export gives the day's rows.
- **Labels**: the PCF primary action reads **Add expense** / **New expense** instead of "New money out".
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; the attachment field was rendered with headless Chrome at 560 px and checked (filled and empty states). The authenticated sales screens were not clicked through (no staff login available).

## PCF expense sheets (cut + history), colored sales money summary, Liquidations removed, SKU renamed (2026-11-15)

- **Expense sheets (cut/close)**: migration `202611150022_pcf_expense_periods.sql` (applied) adds `pcf_periods` — one **open sheet per fund**, every voucher carries `period_id` (assigned by the `pcf_voucher_assign_period` trigger on insert), `v_pcf_period_totals` for counts/totals, and the `close_pcf_period` RPC. **Ending a sheet** stamps its end date, stores it with all its vouchers in history, and immediately opens a new empty sheet. Backfill gave Cebu an open **NOV 9** sheet (29 vouchers / ₱17,339) and Main an open **NOV 15** (0); verified on production.
- **Expenses tab**: **Current expense sheet** card — sheet name, date range, entries, sheet total, fund balance, to-replenish/refund, **Add expense** and **End sheet / Cut**; the cut modal takes the sheet name and notes and warns to record the replenishment first. **Sheet history** lists the closed sheets (dates, entries, total, notes) with a **View** modal showing the sheet's vouchers and receipts. The classification/search filters and Excel/CSV/print now cover the current sheet. The old from/to filters are gone.
- **Report tab**: instead of from/to dates, pick the **expense sheet** (current or any closed sheet); the PETTY CASH MONITORING matrix, totals and export follow the selected sheet, including replenishments inside its date range.
- **Sales history money summary**: Gross, Collected and Balance (red when there is a balance) plus Cash, GCash and Check now sit in a color-coded container above the ledger instead of two muted text lines.
- **Liquidations module removed**: the PCF expenses are the liquidation. `src/features/liquidations/` (page + API), its route `/app/liquidations`, nav item and `canViewLiquidations`/`canPrepareLiquidation` are deleted; the DB liquidation tables remain untouched.
- **SKU wording**: user-facing "SKU" is now **Rice variety** (dropdowns, stock card, containers, prices) or **sack size** where the distinction matters (repacking, product sizes), plus the low-stock notification text. Code/DB identifiers (`skus`, `sku_id`) are unchanged.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; `v_pcf_period_totals` on production shows Cebu NOV 9 / 29 / 17,339 and Main NOV 15 / 0; the new sales-money and current-sheet/cut blocks were rendered with headless Chrome at 1200 px and checked. The authenticated screens were not clicked through (no staff login available), and the cut RPC was reviewed but not executed on live data.

## PCF liquidation report in the monitoring-sheet format + November data (2026-11-15)

- **Vouchers = Expenses, merged**: the two duplicate tabs are one **Expenses** ledger in Petty cash (PCV#, date, description, classification, purpose, amount, receipt, replenished status) with date/classification/search filters, totals, Excel/CSV/print and pagination. The old `src/features/expenses/ExpensesPanel.tsx` is removed; `/app/expenses` still redirects to `/app/pcf`.
- **Report = PETTY CASH MONITORING matrix**: the report now mirrors the company workbook — DATE · PCV# · DESCRIPTION · the 16 ACCOUNT CLASSIFICATION columns · AMOUNT, dates grouped per day, per-classification totals and a grand total, fund/period-expenses/balance header, Prepared/Custodian/Approved signatures. **Export liquidation Excel** writes the same matrix; **Print/PDF** prints only the sheet on one A4 landscape page (named `pcf-landscape` page rule); receipt links stay on screen.
- **Stable PCV numbers**: migration `202611150021_pcf_liquidation_cebu_november.sql` (applied) adds `pcf_vouchers.voucher_no`, unique per fund, assigned by the `pcf_voucher_assign_no` trigger (`PCV-0001`, `PCV-0002`, …). Existing rows were numbered; the trigger was exercised in a rolled-back insert (`PCV-0030`).
- **November 9–14 Cebu data**: the same migration imported the **NOVEMBER 9-** sheet — **29 vouchers, ₱17,339**, PCV-0001…PCV-0029, mapped onto the sheet's classifications (transport 1,515 · meals 4,991 · supplies 264 · utilities 250 · repairs 815 · taxes 2,500 · container 3,050 · bank 54 · gas & oil 400 · diskarga 3,000 · AR employee 500). Cebu balance is now **₱32,661** of its ₱50,000 fund.
- **Classification picker**: new expenses use the 16 official account classifications (legacy categories map onto them for display), so new entries land in the right report column.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; production shows Cebu 29 vouchers / ₱17,339, Main none. The report was rendered with the imported rows and printed to a 1-page A4 landscape PDF. The authenticated screen was not clicked through (no staff login in the in-app browser).

## Petty cash rules, expenses inside PCF, RFH into Fund Requests (2026-11-15)

- **Cebu fund ₱50,000**: migration `202611150020_pcf_rules_and_cebu_fund.sql` (applied) sets the Cebu branch petty cash fund to **50,000.00** (Main stays 10,000.00). Confirmed on production.
- **₱5,000 voucher cap**: a `pcf_voucher_limit` trigger rejects anything above 5,000, and the New money out form validates the same limit with an inline hint and a **Fund Requests** link. Larger expenses belong in the fund-request module.
- **Expenses is now a Petty cash tab**: the former Expenses screen is the embeddable `ExpensesPanel` (`src/features/expenses/ExpensesPanel.tsx`) shown as the **Expenses** tab in Petty cash — same filters, form, receipt upload, Excel/CSV/print and pagination. `/app/expenses` redirects to `/app/pcf` and the separate Expenses menu item is gone.
- **Request for fund moved**: the RFH paper form left Petty cash and now lives in Fund Requests as the **Petty cash RFH** tab (BA/Owner/GA, `src/features/fund-requests/RequestFundPanel.tsx`). It keeps RFH #, purpose, expense period, PCF funding, approvers, released date/thru, additional lines, category totals, receipt review, Excel and print; **Create fund request** saves it as a draft cash advance for the current branch.
- **Record tab removed, merged into Report**: **Report** now carries the monitoring period (from/to, opening/expenses/replenishments/balance), the **Petty cash monitoring** sheet with signatures, the summary totals and both Excel exports plus Print/PDF. The separate Record tab is gone.
- **Receipts in history and liquidation**: Vouchers, Report and the recent-voucher list have a **Receipt** column with a signed-URL View link. Liquidations shows the branch's PCF vouchers with receipts and an **Add as line** action; linked lines show the receipt and store `liquidation_items.pcf_voucher_id` (added in migration 020, unique), so expenses + returned amount can be balanced against the released amount.
- **Permissions**: `can_create_fund_request` now includes **branch_accountant** (DB + `src/lib/roles.ts`), matching the BA's role of preparing the replenishment RFH.
- **Verification**: `npx tsc -b` and `npx vite build` pass; production verified (Cebu 50,000.00, Main 10,000.00, `liquidation_items.pcf_voucher_id` present). The authenticated screens could not be clicked through in the in-app browser (no live staff session), so the visual check is limited to the build and the production schema.

## Searchable customer, DR on new sale, paginated lists and a real date picker (2026-11-15)

- **Customer search**: the New Sale customer field is now a combobox — type part of a name or contact number and pick from the filtered list (`src/components/Combobox.tsx`, arrow keys/Enter/Escape supported). Quick add stays underneath.
- **DR on the sale**: a `Delivery Receipt #` field sits beside `Official Receipt #`. Leave it blank and the branch counter still auto-generates; a typed number is stored as-is and a duplicate in the same branch is rejected with `DR number X is already used in this branch`. Migration `202611150019_sale_dr_number.sql` recreates `create_sale` with `p_dr_number` (applied to the hosted project).
- **Sales history**: the `Date deposit` and `Bank` columns are gone from the ledger and from the Excel export (`DR NO.` takes the last column); cash/GCash/cheque ticks and the summary line are unchanged.
- **Pagination everywhere**: every data table (Sales ledger and overdue dues, Customers, Products/prices, Inventory balances/movements/adjustments, Containers/purchases/suppliers, Expenses, Employees, Fund requests, Liquidations, Petty cash vouchers/replenishments, Reports, Audit log, Inquiries, Branches) now pages 10 rows at a time with a `10 / 25 / 50` rows-per-page selector (`src/components/Pagination.tsx`, `usePaged`). Totals still cover the whole filtered set, not just the visible page.
- **Date pickers**: all date fields use the new `DateInput` (`src/components/DateInput.tsx`) — a styled trigger with a month calendar popover, Today/Clear shortcuts, Escape/outside-click close and fixed positioning so it is never clipped inside modals. Native `<input type="date">` remains only as the hidden fallback value holder.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; migration 019 applied and its signature confirmed on production. The authenticated screens could not be clicked through in the in-app browser this pass (no visible browser surface and no live login session), so the visual check is limited to the build plus the login page console.

## Dashboard showed the wrong day and counted GCash as cash (2026-11-15)

- **Date**: `todayInputValue()` / `toDateInputValue()` used `toISOString()`, i.e. the **UTC** date. Between midnight and 08:00 in Manila they returned yesterday, so at 01:15 on 11/15 the dashboard labelled 11/14's ₱261,020 as “Today's sales” (header still said November 15). Both helpers now build the date from local year/month/day; existing date-only strings are passed through untouched. Price lookup, overdue installments, customer balances, container arrival date and the reports date range now use the same helper.
- **Cash on hand**: the card summed **all** payment rows for the day, so it always equalled gross sales. It now counts `method = 'cash'` only — 11/14 reads **₱183,300.00**, with the GCash portion (₱77,720.00) left to the Sales history summary.
- **After midnight**: the sales and cash cards now append yesterday's figures (`· yesterday ₱261,020.00` / `· yesterday ₱183,300.00`) so the just-closed day is still visible before the first sale of the new day.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; production totals confirmed (11/14 cash 183,300.00; 11/15 cash 0.00).

## Split payments: GCash part + cash remainder (2026-11-15)

- **Problem**: the Sales-In import gave each sale a single payment method taken from the day's named GCash lines, so a customer who paid partly in GCash showed as fully GCash (ROMEL 112,900) or fully cash (MARK DURBAN 8,000), and the day's cash on hand did not match the sheet. For **11/14/2026** the sheet says total 261,020.00 = GCash 77,720.00 (Mark 1,000 · Shariel 3,480 · Romel 72,700 · C/O BOSS 540) + cash on hand 183,300.00.
- **Data fix**: migration `202611150018_sales_split_payments.sql` rewrites the payment rows of **29 sales** (19 of them splits) to the components named in the workbook payment block — named `GCASH PAYMENT FROM X` lines belong to that customer's sale, `C/O BOSS` is GCash, check/bank deposits keep their method, and every other sale that day is cash. 11/14 now reconciles exactly: **cash 183,300.00 (19 rows) + GCash 77,720.00 (4 rows) = 261,020.00**, balance 0.00, and no imported sale has payment rows that disagree with its total. Applied to the hosted project.
- **New sales can split too**: `create_sale` accepts an optional `p_payments` JSON array (`[{method, amount, reference}]`) that must add up to the sale total; each component becomes its own `payments` row, and `sales.payment_type` is set to the largest component so existing reports keep working. Called without `p_payments`, behaviour is unchanged. `salesApi.createSale` forwards `payments`.
- **New Sale form**: when the method is Cash, GCash, Check or Bank there is a **“Cash + GCash”** chip — enter the GCash amount and the cash remainder (validated to be above zero and below the total) is shown and sent as the second component. Installments keep their existing down-payment flow.
- **History totals**: the Sales history card now shows a second summary line — `Cash ₱… · GCash ₱…` (plus Check/Bank when present) — summed from the payment rows of the filtered sales, and **Export Excel** writes a CASH row and a GCASH row (plus CHECK/BANK when non-zero) under TOTAL.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass; the 11/14 ledger was previewed at 1440 px — ROMEL and MARK DURBAN ticked in both Cash and GCash, SHARIEL and C/O BOSS GCash only, TOTAL 455 bags / ₱261,020.00, header `Cash ₱183,300.00 · GCash ₱77,720.00`. The split RPC path was exercised in a rolled-back transaction (total 100 → cash 60 + GCash 40).

## Sales-In ledger import from SALES CEBU.xlsx (2026-11-15)

- **Imported**: all **59 daily sheets** of the Cebu Sales-In book — **561 sales, 832 line items, 237 customers, ₱56,459,750 across 53,921 bags**, dated 2026-09-07 → 2026-11-14. Each sheet is one business day; a new sale starts where the **NAME** cell changes (invoice numbers exist on some days only, and continuation rows leave NAME blank). The payment/expense notes below or to the right of the sale block are **not** imported — those are the day's expenses already deducted from sales.
- **Records**: migration `202611150017_sales_cebu_import.sql` added `sales.import_key` (unique per branch, so a re-run imports nothing twice) and `sale_items.source_description` (keeps the original sheet wording, e.g. “K-JASMINE 25KG”, even when mapped to a SKU). Customers were matched case-insensitively within the branch or shared customers and created when missing; the invoice no. is stored as `or_number`, the generated `IMP-…` as `dr_number`. Each sale is completed and fully paid, with one payment row carrying the sheet's method (cash/gcash/check/bank) and bank reference; a delivery receipt is written. Stock movements are intentionally **not** written for historical sales.
- **Catalog**: 9 varieties and 16 SKUs were added for the brands in the ledger (Camel India, Super Mama India, Mama's Best, Jasmine, Sweet Daisy, Bambin, Eskaya, Buko Pandan, Used Empty Sacks) with prices taken from the latest observed price.
- **Sales history = the Sales-In sheet**: the history table is now the ledger layout — Date, Invoice no., Name, Description, Bags, Price, Amount, Date deposit, Bank, Cheque, Cash, GCash (plus a DR button) — with carry-forward cells left blank on the second and later lines of a sale, a bold **TOTAL** footer for bags and gross, and the same 12-column layout in **Export Excel** (`.xls`, one day after another, newest first).
- **Verification**: migration applied to production (`npx supabase db query --file … --remote=ylpcutmsolvmloqjnwze`); a second run leaves 561 sales; every one of the 59 sheets reconciles to the imported sale rows; `npx tsc -b --force` and `npx vite build` pass; ledger checked at 1440 px with all 13 columns visible.

## Desktop layout on laptops and Mac windows (2026-11-13)

- **Cause**: the desktop sidebar only appeared from **900 px** wide. A MacBook browser window (or any laptop with the window not maximised) often sits below that, so the app fell back to the phone topbar, bottom tab bar and a single full-width column — the "mobile" UI on a desktop screen.
- **Fix**: the desktop shell now starts at **720 px**. From 720–1099 px the sidebar collapses to an **88 px icon rail** (logo, icon-only nav, power-icon sign-out, tooltips on hover); at **1100 px and up** it is the full 272 px sidebar with labels, branch name and text sign-out. The phone layout is now only for real phone/small-tablet widths.
- **Implementation**: `AppShell.tsx` wraps nav labels/brand text in `.shell-nav-label`/`.shell-brand-text` and sign-out in `.shell-signout-icon`/`.shell-signout-label`, with `title`/`aria-label` on icon-only controls. `shell.css`, `tokens.css` (`--page-pad`) and `global.css` (`.app-page` bottom padding) all use the 720 px breakpoint; the new `@media (min-width: 720px) and (max-width: 1099px)` block is the icon rail.
- **Verification**: screenshots at 700 px (phone layout as intended), 760 px and 1000 px (icon rail beside content, no topbar/bottom tabs), 1200 px (full labelled sidebar). `npx tsc -b --force` and `npx vite build` pass.

## Sign-in ends with the tab and after five idle minutes (2026-11-13)

- **Session storage**: the Supabase auth client now keeps its session in `sessionStorage` instead of `localStorage`, so closing the tab or the browser ends the login and the next visit asks for the password again. Each tab has its own session; existing `localStorage` tokens from the previous build are removed on load.
- **Idle timeout**: `AuthContext` tracks keyboard, mouse, touch, wheel and scroll activity. After **5 minutes with no input** it calls `signOut()` (server sign-out, local fallback). Background tabs are re-checked on `visibilitychange` because browsers throttle timers.
- **Token handling**: `autoRefreshToken` still rotates the access token while the tab is open; the cached session is dropped on sign-out so no stale token can be reused.

## Official company details on the public site (2026-11-13)

- **Contact**: the landing page now shows the real Phone/Viber number **+63 932 305 3491** (tap-to-call and Viber chat links), a link to the JMG Commodities Facebook Page, and the main office address — replacing “provide your number in the form” placeholders. The footer repeats the address and contact links.
- **Locations**: built-in branch cards are now **Angeles City (main office & branch)**, **Cebu (Tipolo, Mandaue)** and **Bohol (Tagbilaran)** with maps keyed to those addresses. `seed.sql` and new migration `202611130016_company_details.sql` update the stored branch directory and `company_settings` address/contacts; the migration only replaces placeholder values, so anything already edited in Settings is kept.
- **Products**: cards now use the official brands — Kasikas (Pure Local/Jasmine), Super Mama India and Camel India (raw white), Mama's Best Super Dinurado (50 kg and 25 kg), Sweet Daisy Special Sinandomeng, Japonica Japanese Round — with the rice type under each name. Bambin and “Myanmar” labels were removed.
- **Services**: the features grid now leads with wholesale & retail, doorstep delivery through partner services such as Maxim, and online booking/reservations; the fleet copy explains own trucks for bulk plus partner couriers for door-to-door orders.
- **SEO/meta**: `index.html` description, `og:description` and `twitter:description` now name the brands and Angeles City/Cebu/Bohol. Hero stats read 6 rice brands · 2 sack sizes · 3 locations.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass.

## Link previews and icons (2026-11-13)

- **Share image**: `og:image` / `twitter:image` pointed at a *relative* path (`/JMG TRUCKS.jpg`) with a space in the filename, which Facebook and Messenger cannot resolve, so links showed no picture. Added `public/og-image.jpg` — a 1200×630 crop of the Kasikas/truck photo with the JMG shield and company tagline — referenced by absolute URL, plus `og:image:width/height/type/alt`, `og:url` and `og:locale`.
- **Icons**: browser tab now uses the existing `favicon.svg` (was pointing at the square logo JPEG); added `apple-touch-icon.png` (180×180) and PNG `icon-192` / `icon-512` manifest icons, which Chrome needs for install/PWA and Android home-screen shortcuts.
- **Cache busting**: the share image and `apple-touch-icon` still previewed blank on Facebook because the first scrape (made before the image existed) is cached for the exact URL. `og:image` / `twitter:image` now point at `og-image.jpg?v=2` (plus `og:image:url` and a legacy `link rel="image_src"`), so a re-scrape fetches a fresh image object. The server itself already serves the 1200×630 JPEG with a 200 and `image/jpeg` to `facebookexternalhit`.
- **Note**: Facebook caches the first scrape of a URL. After deploy, run the link through `https://developers.facebook.com/tools/debug/` and click **Scrape Again** (or append `?v=2`) to see the new preview.

## No reload when returning to the browser tab (2026-11-13)

- **Cause**: on `visibilitychange` → visible, `@supabase/auth-js` calls `_recoverAndRefresh()`, which re-emits **`SIGNED_IN`** with the stored session (not `TOKEN_REFRESHED`). `AuthContext` treated that as a fresh login: it refetched the profile, set `profileLoading`, and `RequireAuth` swapped the whole page tree for `SplashLoader` — so every page remounted and refetched on each tab focus.
- **Fix**: profile loads are now keyed to the signed-in user id. Same user → the session is swapped only if the access token actually rotated; no profile fetch, no splash, no remount. A real login (new user id) still loads the profile; `SIGNED_OUT` clears the tracked id.
- **Verification**: `npx tsc -b --force` and `npx vite build` pass.

## Landing page GSAP parallax + scroll animations, login back button (2026-11-12)

- **GSAP + ScrollTrigger** (`gsap@3.15.1`, registered once in `LandingPage`): the hero photo parallaxes (`scale 1.22`, `yPercent -6 → 6`) behind copy that lifts and fades out as you scroll; the fleet photo drifts (`scale 1.2`, `yPercent -8 → 8`) inside its frame; section labels/headings/CTAs rise in on entry; feature, product and branch grids stagger in (70–80 ms per card); the inquiry, privacy and footer blocks reveal on arrival. A 3 px jade→gold **scroll-progress bar** scrubs across the top, and the sticky nav gains a shadow after 16 px of scroll.
- **Implementation**: every tween/trigger lives in a `gsap.context` scoped to the landing page and is reverted on unmount (StrictMode-safe). Branch cards get their own effect keyed to the `public_branches()` result so late-arriving cards still animate, followed by a `ScrollTrigger.refresh()`. The previous IntersectionObserver/CSS reveal was removed.
- **Reduced motion**: with `prefers-reduced-motion: reduce` the GSAP block is skipped entirely and content stays fully visible (progress bar and nav shadow stay off), while clicks use instant navigation.
- **Login back button**: `/login` shows a floating **← Back to website** button at the top-left (over the hero on desktop, clears the form on phones via 76 px top padding), in addition to the footer link.
- **Click transitions retained**: every “Staff Login” link plays a 240 ms fade/slide-out (`pub-page-out`) before routing and `/login` fades/slides in (`login-page-in`); modified clicks are left to the browser. Nav/hero/footer anchors smooth-scroll to their sections (`scroll-margin-top: 76px`) and pulse the target label/title (`pub-label-hit` / `pub-title-hit`).
- **Verification**: `npx tsc -b --force` clean, `npx vite build` passes (bundle 875 kB / 250 kB gzip; GSAP adds ~46 kB gzip). The GSAP path was exercised in the dev browser by temporarily disabling the reduced-motion guard: 28 ScrollTriggers were created, the hero background reached `translate(0%, 6%) scale(1.22)`, the progress bar scrubbed to `scale(.70)`, `pub-scrolled` toggled on scroll, and branch cards animated from `opacity 0 / y 36px` toward their resting state — with no console errors (only the known pending `public_branches` 404). The guard was restored and the file reloaded afterwards.

## Accounts, map pins, containers, liquidations, customers, installments, exports (2026-11-12)

- **Accounts editing** (`EmployeesPage`): Owner, General Accountant and System Admin can now edit staff profiles (name, phone, role, branch, status). Passwords and sign-in emails are **System Admin only** — a new “New password” field appears only for them and calls the new Edge Function `admin-update-user` (service role, checks the caller is an active System Admin, confirms the new email, syncs `profiles.email`, writes `audit_log`). The System Admin login email itself must be changed in the Supabase dashboard. Migration 014 adds the matching `profiles_manage_owner_ga` UPDATE policy (owners/GAs cannot touch `system_admin` rows).
- **Exact branch pins** (`BranchesPanel`): latitude/longitude fields, a **Find on map** geocode (OpenStreetMap Nominatim), paste-a-Google-Maps-link/coordinates parser, live OSM preview with marker, and an **Edit** action per branch (address/contact/pin/name). The landing page uses the pin in `mapQuery` when present, and `public_branches()` now returns latitude/longitude (migration 014).
- **Container number + supplier change** (`ContainersPage` + `containersApi`): new optional `container_number` (migration 014), shown as its own column and card title, and an **Edit details / supplier** form on any container that has not been received/closed — supplier, purchase, container number, supplier ref, origin, ETA, primary branch and notes.
- **Liquidations is its own module** (`/app/liquidations`, migration 015): released fund requests appear as **Open advances**; **Prepare** opens a draft liquidation with requested / expensed / to-return / unaccounted totals and expense lines (date, category, description, amount) plus an audit trail of submitted liquidations. Submit closes the fund request (status `liquidated`) with actual spent and returned amounts. The Liquidation tab was removed from Fund Requests — that page is now only the request/approval flow.
- **Customers separate from Sales** (`/app/customers`): branch-scoped customer list with contact info, open sales, outstanding balance, next due and overdue flag; add/edit customers; per-customer open-sales statement; CSV export. Sales now has its own **Sales history** tab.
- **Installments before submit** (New sale): down payment, number of parts and **first due date** (default today + 30) with a live schedule preview (30-day spacing, last part absorbs rounding, **0% interest**) and validation that the down payment cannot exceed the total. The RPC already supported these fields; they are now chosen in the flow.
- **CSV exports on form screens**: fund requests list, sales history, website inquiries, stock on hand, SKU list, containers, supplier purchases, suppliers — in addition to PCF, expenses, customers, liquidations, reports and audit.
- **No more skeleton flash on tab switch**: `AuthContext` now builds `user` from scalar `userId`/`email`/`profile` values, so Supabase `TOKEN_REFRESHED` (fired when a browser tab regains focus) no longer creates a new user object that makes every page refetch and flash its skeleton. Sales, containers, fund requests and inquiries also only show the skeleton on first load.
- **Verification**: `npx tsc -b --force` clean and `npx vite build` passes; landing page branch section renders in the dev server. Authenticated screens could not be exercised because the dev session is logged out and no staff credentials are available in-session.
- **Still to apply/deploy**: migrations **013, 014, 015** in the Supabase SQL editor; `create-employee` and `admin-update-user` Edge Functions; Resend key for `notify-inquiry` (deferred by the owner).

## Public website: price toggle, inquiry email, branch maps, sitemap (2026-11-12)

- **Migration 013** (`202611120013_public_site.sql`, **not yet applied** — run it in the Supabase SQL editor): adds `company_settings.show_public_prices` (default `true`); `public.public_branches()` (SECURITY DEFINER, granted to anon) returning name/address/contact of active branches so the website can show branches while `branches` stays authenticated-only; inquiry length constraints (name 2–120, contact 5–160, message 10–2000, branch ≤ 120); and a trigger that rejects a second inquiry from the same contact within 60 seconds.
- **Settings → "Show prices on the public website"** checkbox (`show_public_prices`). It only appears once the column exists (migration 013), so saving against an older database cannot fail; when off, the landing page shows “Ask for a quote” instead of per-sack prices.
- **Landing page reads live public data**: `company_settings.show_public_prices` controls the price display and `public_branches()` fills the branch cards (falls back to the built-in Main branch card if the RPC is unavailable). Each branch card embeds a keyless Google Maps map (`output=embed`) plus an “Open in Google Maps” link, searching the saved **address** (and only falling back to the branch name when the address is empty — “Main branch + Metro Manila” matched an unrelated business).
- **Branch admin hint**: the Settings → Branches form now tells the owner to use the full street address, and the branch table has a “Map” link to preview the pin.
- **Staff email notification**: new Edge Function `supabase/functions/notify-inquiry/index.ts` (Deno, CORS, Resend REST API, optional). `submitInquiry` invokes it fire-and-forget after the row is saved, so a missing function or email key never blocks an inquiry. Needs `RESEND_API_KEY`, `INQUIRY_NOTIFY_TO`, `INQUIRY_NOTIFY_FROM` secrets and deployment (see HANDOFF).
- **SEO**: `vite.config.ts` gained a build-only plugin that injects `<link rel="canonical">` and `og:url`, makes `og:image`/`twitter:image` absolute, and writes `dist/sitemap.xml` plus a `Sitemap:` line in `robots.txt` when `VITE_SITE_URL` is set (documented in `.env.example`). Without it the build output is unchanged.
- Verified: `tsc -b --force` clean; `vite build` with `VITE_SITE_URL=https://jmgcommodities.example` produced canonical/og:url/absolute og:image and the sitemap/robots files; in the dev server all 8 product cards show the correct prices, the consent + honeypot fields and `#privacy` render, the branch map iframe and Maps link use the branch address, and the Settings toggle + branch "Map" links render (toggle UI verified with the column temporarily forced on, then reverted).

## Public website: real product prices and hardened inquiry form (2026-11-12)

- **Products replaced** on the landing page with the owner's current list (8 items, price per sack): Mama's Best Myanmar 50 kg ₱2,360 and 25 kg ₱1,180, Japonica 25 kg ₱1,160, Super Mama 50 kg ₱1,900, Sweet Daisy Myanmar 25 kg ₱1,100, Bambin Myanmar 25 kg ₱1,130, Jasmine Generic 25 kg ₱1,270, Camel India 50 kg ₱1,900. Prices use `Intl.NumberFormat` (PHP, no decimals) and a note that they may change.
- **Page copy updated** to match the new range: hero paragraph and stats (8 products, 2 sack sizes), nav “Products”, section “Rice by brand and sack size”, the fleet section no longer advertises Kasikas, and the footer product list/brand paragraph now reflect the new brands.
- **Inquiry form hardened (client side)**: hidden honeypot field (bots get a fake success, nothing is saved), required consent checkbox linked to the privacy notice, length limits (name 120, contact 160, area 120, message 2000; minimum 2/5/10), trimmed values, and a 60-second per-browser cooldown stored in `localStorage`.
- **Privacy notice** section added (`#privacy`, linked from the form and footer) covering what is collected, purpose, 12-month retention, access/correction/deletion, and RA 10173.
- **SEO basics**: `public/robots.txt` (blocks `/app` and `/login`), `og:type`, `og:site_name`, description, and Twitter card/title/description/image tags; page title now “JMG Commodities — Premium Rice Supplier”.
- Verified in the dev server: 8 product cards render with the correct prices, consent and honeypot fields are present, and the privacy block is reachable from the form. `tsc` and `vite build` pass.
- **Not built yet** (needs owner input/keys): Settings show/hide-prices toggle (needs a `company_settings` column + migration), staff email notification on new inquiry (needs an Edge Function + email provider), captcha (needs a Turnstile/hCaptcha site key), real branch addresses with map links (only a placeholder branch exists), and `sitemap.xml` (needs the production domain).

## Motion and animated loading states (2026-11-12)

- **Click feedback**: added `ClickPulse` (mounted once in `main.tsx`) that draws a jade ripple at the pointer for every click on buttons, links, chips, table rows, metric cards, quick links and checkboxes. Press states added for buttons (`scale 0.97`), chips (`0.94`), sidebar/bottom/drawer links and table rows; page content enters with a short fade/slide (`page-enter`); notification panel pops in and the phone drawer slides in.
- **Motion tokens**: `--ease-out`, `--motion-fast` (140ms), `--motion-base` (220ms), plus skeleton colours. All motion is disabled by `prefers-reduced-motion: reduce`.
- **Animated loading instead of text**: new `src/components/Loading.tsx` with `SkeletonText`, `SkeletonTable` and `SplashLoader` (shimmer bars, screen-reader-only label). Replaced every visible "Loading…" / "Loading inventory…" / "Loading settings…" / "Loading session…" / "Checking…" in dashboard, audit log, sales, inventory, containers, products, reports, fund requests, PCF, inquiries, employees, settings, notifications and the auth guard.
- **Button loading**: `Button` gained a `loading` prop that keeps its width and swaps the label for a spinner; used for sign in, add branch, create/save employee, create fund, save settings, logo upload, and the public inquiry form (plus the "Checking stock" hint in New sale).
- Verified in the dev server (System Admin): click ripple element is created with the `click-pulse` animation, `page-enter` applies to pages, the reports skeleton table and the notification-panel skeleton render, and no console errors. The automation browser reports `prefers-reduced-motion: reduce`, so animations were verified via computed styles rather than visually.

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
