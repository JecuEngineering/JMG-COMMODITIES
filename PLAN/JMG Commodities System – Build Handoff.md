# JMG Commodities System – Build Handoff

Prepared November 10, 2026. Design preview: https://claude.ai/artifact/MorBDC33zGkVxA9dEWMBAZ

## How to use this

Paste the **Master context** once at the start of any new chat with Claude Fable or Opus. Then paste **one phase prompt at a time**. Test each phase before starting the next. If your tokens run out, open a new chat, paste the Master context again, say which phase you finished, and continue.

## Master context (paste first)

```
I am building a web system for JMG Commodities Inc., a licensed Philippine rice supplier and importer (Kasikas Jasmine, Japonica, white, parboiled, glutinous; local and imported).

Stack: React 18 + TypeScript + Vite, Supabase (Postgres, Auth, Storage, Row Level Security), Netlify. Responsive PWA: staff use phones, accounting uses laptops.

Modules: users/roles/branches/employees, products + SKUs + price list, inventory (stock in/out, repacking, branch transfers), container arrival and loading, suppliers/purchases, sales + customers + installments (no interest, no penalty) + Delivery Receipt (Official Receipt number only referenced), expenses + accounting reports, petty cash fund (PCF) per branch, fund requests (Labor -> Branch Accountant -> Owner -> General Accountant releases by online transfer or check -> liquidation), public landing page with inquiries. POS-ready design.

Rules: every table has branch_id where relevant and Row Level Security by role and branch; money is numeric(14,2) in PHP; stock changes only through a stock_movements ledger, never by editing a count; soft-delete and an audit log for every create/edit/approve/delete; no secrets in the repo; build one phase at a time and tell me exactly how to test it.

Design: simple, modern, aesthetic. Warm off-white background #F6F3EC, white cards with 16px radius and a 1px #E7E2D6 border, jade green accent #1F6B58, Inter for text, Space Grotesk for headings, large touch targets on phone screens, company logo in the header, login and printed documents.
```

## What you need before building

- Supabase project and Netlify account, a GitHub repository, Node 20 or newer
- Company logo (PNG or SVG with transparent background) and company details: name, address, TIN, contact numbers
- List of branches (name, address) and the PCF opening amount per branch
- List of employees with their role and branch
- Rice varieties, sack sizes (5kg, 25kg, 50kg), starting prices and opening stock per branch
- Expense categories and a sample Delivery Receipt with its numbering format
- Your accountant confirming the Delivery Receipt and Official Receipt rules
- Optional: domain name for the public site

## Project structure

```
jmg-system/
  src/
    app/            routes, layout, auth guard
    components/     buttons, cards, tables, forms
    features/
      auth/ branches/ employees/ products/ inventory/
      containers/ suppliers/ sales/ customers/ expenses/
      pcf/ fund-requests/ reports/ website/
    lib/            supabase client, money and date helpers
    styles/         tokens (colors, fonts, spacing)
  supabase/
    migrations/     one SQL file per phase
    seed.sql
  public/            logo, icons, manifest
```

## Main tables

- **Core:** branches, profiles (user, role, branch), roles/permissions, audit\_log, company\_settings
- **Products:** varieties, skus (variety + sack size + barcode), prices (sku, price, effective\_from)
- **Inventory:** stock\_movements (sku, branch, qty, type, reference), repacking, repacking\_lines, transfers, transfer\_lines
- **Containers and purchases:** suppliers, containers, container\_lines, container\_costs, purchases
- **Sales:** customers, sales, sale\_items, payments, installment\_plans, delivery\_receipts, cashier\_shifts
- **Money:** expenses, expense\_categories, pcf\_funds, pcf\_vouchers, pcf\_replenishments
- **Requests:** fund\_requests, fund\_request\_steps, liquidations
- **Website:** inquiries

## Build phases and prompts

### Phase 1 – Foundation

```
Set up the Vite + React + TypeScript project with the folder structure above and the design tokens. Create the Supabase migration for branches, profiles, roles, audit_log and company_settings with Row Level Security. Build login, a role-aware app shell (sidebar on laptop, bottom tabs on phone), employee management (add, edit, deactivate, assign role and branch), and company settings with logo upload used in the header and login page. Roles: Owner, General Accountant, Branch Accountant, Cashier, Warehouse, Employee, System Admin.
```

Done when: each role logs in and sees only its allowed menu and branch.

### Phase 2 – Products and prices

```
Add varieties, SKUs per sack size (5kg, 25kg, 50kg) with barcode field, and a price list with effective dates. Only certain roles can change prices. Log every price change.
```

Done when: changing a price does not change old sales.

### Phase 3 – Inventory

```
Build the stock_movements ledger and screens for stock in, adjustments with reason, stock card per SKU, low-stock alerts, repacking (input sacks to output sacks, with weight lost recorded) and branch-to-branch transfers with an in-transit status.
```

Done when: stock per branch always equals the sum of its movements.

### Phase 4 – Containers and suppliers

```
Build suppliers, purchases and containers. A container has the supplier reference number, status (In Transit, Arrived, Unloading, Received, Closed), expected versus actual sacks per SKU, landed costs (purchase, freight, duties, handling, trucking) and unloading details. Receiving it creates stock-in per branch and computes the real cost per sack.
```

Done when: a received container updates stock and cost per sack.

### Phase 5 – Sales, customers, installments

```
Build a phone-first New Sale screen (customer, variety, sack size, quantity, price, payment type). Separate payments from sales so one sale can have many payments. Add installment plans with due dates, balances and an overdue list (no interest, no penalty). Generate a printable Delivery Receipt with logo and a per-branch number, plus a field for an Official Receipt number. Saving a sale deducts stock. Add cashier shifts (open, count, close).
```

Done when: an installment sale shows the correct remaining balance after each payment.

### Phase 6 – Expenses and accounting reports

```
Build expenses with categories and receipt photos, and reports: daily sales, cash on hand, profit, margin per variety, receivables, monthly summary per branch and consolidated. Export to PDF and Excel.
```

Done when: totals match a hand-checked sample day.

### Phase 7 – Petty cash per branch

```
Build a petty cash fund per branch with a custodian, vouchers with receipt photos, running balance, and replenishment listing all vouchers since the last one. Add a General Accountant view of all branch funds with low-fund alerts and a printable PCF report.
```

Done when: balance equals opening fund minus vouchers plus replenishments.

### Phase 8 – Fund requests

```
Build the fund request form and the flow: Employee -> Branch Accountant -> Owner -> General Accountant releases (online transfer or check, with reference number) -> liquidation with receipts and returned amount. Each step has a status, timestamp, notification and rejection reason. Released requests can post to PCF or expenses.
```

Done when: a request moves through every step and cannot skip one.

### Phase 9 – Public website

```
Build the public landing page: logo, about, the five rice varieties, sack sizes, branch locations, contact and an inquiry form that saves into an inquiries list for staff. The staff system lives behind login at /app.
```

Done when: an inquiry from the public page appears in the staff list.

### Phase 10 – Polish and launch

```
Add the dashboard, PWA install support, backups, empty and error states, and a test checklist per role. Prepare a pilot rollout for one branch, then the other branches.
```

Done when: a real branch has used it for a full week.

## Rules to repeat to Claude

- One phase per session, and ask it to list what changed and how to test.
- Never skip Row Level Security, even in early phases.
- Do not store money as floats.
- Keep a short CHANGELOG.md updated after every phase so a new chat can continue from it.
- Consult the accountant before using the system for any official BIR document or a POS.

# Part 2 – Full Plan and Reference

Use this part when you forget what was decided. It holds the full scope, the permission matrix, the detailed fields, the workflows and the screens.

## 1. Business and goal

JMG Commodities Inc. is a licensed Philippine rice supplier and importer (Kasikas Jasmine, Japonica, white, parboiled, glutinous; local and imported). The goal is one web system where staff encode every sale, expense, cash fund movement and stock change, so nobody counts money or stock by hand. It has many staff and many branches around the Philippines, each with its own login, role and branch access, and it uses the company logo everywhere.

## 2. Decisions already made

- Customers can pay in installments, with **no interest and no penalty**.
- Prices are **per variety and per sack size** and change often, so the price list has effective dates and old sales keep their old price.
- Sack sizes: 5kg, 25kg, 50kg. JMG **repacks** larger sacks into smaller ones itself.
- Imports: the supplier tracks the container on its own system. JMG records the container arrival, loading, sacks and landed costs, and keeps the supplier reference number.
- Documents: the **Delivery Receipt** is the default. A BIR Official Receipt is issued only if the customer wants one, and the system only stores its number.
- **Petty cash fund (PCF) is per branch.**
- **Fund request flow:** Labor/Employee → Branch Accountant → Owner → General Accountant releases the money (online transfer or check) → liquidation.
- Staff use phones and accounting uses laptops, so it is one responsive web app (PWA).
- Customers do **not** log in, but there is a **public website** with a landing page.
- The system is **POS-ready** so a POS can be added later.
- Design: simple, modern, aesthetic (see the design preview link at the top).

## 3. Modules (full scope)

1. **Users, roles, branches, employees, settings:** accounts per user, roles scoped per branch, add/edit/deactivate employees, company logo and details (name, address, TIN, contacts), categories, audit log.
2. **Products and prices:** varieties, SKUs per sack size with barcode field, price list with effective dates, supplier cost history, margin per variety.
3. **Inventory:** stock ledger, stock in, adjustments with reason, stock card per SKU, low-stock alerts, **repacking** (with weight lost recorded), **branch transfers** with an in-transit status.
4. **Container arrival and loading:** supplier reference number, status (In Transit, Arrived, Unloading, Received, Closed), expected versus actual sacks, shortages and damage, landed costs (purchase, freight, duties, handling, trucking), unloading details and photos, split between branches, real cost per sack.
5. **Suppliers and purchases:** supplier list, purchases, payables and payment status.
6. **Sales, customers, installments:** sale encoding, customers with history, payments separate from sales, installment plans with due dates and balances, overdue list, statement of account, Delivery Receipt with per-branch numbering, Official Receipt number field, cashier shifts.
7. **Expenses and accounting reports:** expenses with categories and receipt photos; daily sales, cash on hand, profit, margin, receivables, monthly summary per branch and consolidated; PDF and Excel export.
8. **Petty cash (per branch):** fund amount, custodian, vouchers with receipts, running balance, replenishment, all-branch view for the General Accountant.
9. **Fund requests:** form, approval flow, release details, liquidation, notifications, printable form.
10. **Public website:** landing page, varieties, sack sizes, branches, contact, inquiry form feeding a staff inquiries list.
11. **POS-ready layer:** clean sale and payment records, barcode field, cashier shifts, API endpoints, per-branch numbering.

## 4. Roles and permission matrix

These are suggested defaults. Confirm them with the owner before building. **All** = every branch, **Own** = own branch only, **View** = read only, **—** = no access.

| Module | Owner | General Accountant | Branch Accountant | Cashier | Warehouse | Employee | System Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Users, roles, employees | View | View | — | — | — | — | Full |
| Company settings, logo | Full | View | — | — | — | — | Full |
| Branches | Full | View | View | — | — | — | Full |
| Products and SKUs | Full | View | View | View | View | — | Full |
| Price list | Full | Full | View | View | View | — | — |
| Inventory view | All | All | Own | Own | Own | — | — |
| Stock in, repacking | View | View | Approve (Own) | — | Create (Own) | — | — |
| Stock adjustments | Approve | View | Approve (Own) | — | Request (Own) | — | — |
| Transfers | View | View | Approve (Own) | — | Create/receive (Own) | — | — |
| Containers | Full | Full | View (Own) | — | Receive (Own) | — | — |
| Suppliers, purchases | Full | Full | View | — | — | — | — |
| Sales | View (All) | View (All) | Full (Own) | Create (Own) | — | — | — |
| Customers, installment payments | View (All) | View (All) | Full (Own) | Create/collect (Own) | — | — | — |
| Expenses | View (All) | Full (All) | Full (Own) | — | — | — | — |
| Petty cash | View (All) | Full (All) | Full (Own) | — | — | — | — |
| Fund requests | Approve | Release | Review and forward (Own) | — | Create own | Create own | — |
| Reports | All | All | Own | — | Stock only (Own) | — | — |
| Audit log | View | View | — | — | — | — | View |
| Website inquiries | View | View | View | — | — | — | Full |

## 5. Fields per main table

- **branches:** id, name, address, contact, active
- **profiles:** id (auth user), full name, role, branch, phone, active
- **company\_settings:** name, address, TIN, contacts, logo, DR prefix
- **varieties:** id, name, origin (local or imported), active
- **skus:** id, variety, sack size (5, 25, 50 kg), barcode, active
- **prices:** id, sku, price, effective from, set by
- **stock\_movements:** id, sku, branch, quantity (plus or minus), type (stock\_in, sale, adjustment, repack\_in, repack\_out, transfer\_in, transfer\_out), reference id, note, created by, date
- **repacking:** id, branch, date, input weight, output weight, weight lost, reason, created by; **repacking\_lines:** repacking, sku, direction (in or out), sacks
- **transfers:** id, from branch, to branch, status (Draft, In transit, Received), dates; **transfer\_lines:** transfer, sku, sacks sent, sacks received
- **suppliers:** id, name, contact, notes
- **purchases:** id, supplier, date, total, paid amount, status
- **containers:** id, supplier reference number, supplier, origin, arrival date, status, branch, notes; **container\_lines:** container, sku, expected sacks, actual sacks, cost per sack, difference reason; **container\_costs:** container, type (purchase, freight, duties, handling, trucking, other), amount, reference
- **customers:** id, name, contact, address, branch, notes
- **sales:** id, branch, customer, date, cashier, status, total, DR number, OR number (optional), notes; **sale\_items:** sale, sku, sacks, price per sack, discount, line total
- **payments:** id, sale, date, amount, method (cash, GCash, bank, check), reference, received by
- **installment\_plans:** id, sale, total, number of parts; **installment\_dues:** plan, due date, amount, paid amount
- **cashier\_shifts:** id, cashier, branch, opened at, opening cash, closed at, expected cash, counted cash, difference
- **expense\_categories:** id, name; **expenses:** id, branch, category, date, amount, payee, notes, receipt photo, created by
- **pcf\_funds:** id, branch, custodian, fund amount; **pcf\_vouchers:** id, fund, date, payee, purpose, category, amount, receipt photo, created by; **pcf\_replenishments:** id, fund, date, amount, vouchers covered, released by
- **fund\_requests:** id, requester, branch, purpose, category, amount, status, attachments, created at; **fund\_request\_steps:** request, step, actor, action (approved, rejected, forwarded, released), reason, timestamp, release method (online or check), reference number, bank; **liquidations:** request, actual spent, returned amount, receipts
- **inquiries:** id, name, contact, message, status, created at
- **audit\_log:** id, user, action, table, record id, old value, new value, timestamp

## 6. Key workflows

**Sale:** cashier picks branch customer, variety, sack size, quantity and price → chooses payment (cash, GCash, installment) → saves → stock is deducted by a movement → payment recorded → Delivery Receipt printed → if installment, a plan with due dates is created and later payments reduce the balance.

**Container:** created as In Transit with the supplier reference number → marked Arrived → unloading recorded → actual sacks compared with expected → landed costs added → Received creates stock in per branch and the cost per sack → Closed when costs are complete.

**Repacking:** warehouse selects input sacks and output sacks → system records the weight lost → stock out of the big sacks and stock in of the small sacks → output cost comes from the input cost.

**Branch transfer:** sender creates it (stock out, In transit) → receiver confirms the received sacks (stock in) → differences are flagged.

**PCF:** custodian records vouchers → balance falls → when low, the system lists vouchers since the last replenishment and the amount to replenish → replenishment is requested and released.

**Fund request statuses:** Draft → Submitted → Forwarded to Owner → Approved → Released → Liquidated (or Rejected with a reason at any review step). A request cannot skip a step.

## 7. Screens

- **Staff on phone:** New sale, collect installment payment, stock count and stock in, repack, receive transfer, fund request form and status, voucher with receipt photo.
- **Accounting on laptop:** dashboard, sales and customer balances, expenses, PCF per branch, approvals, reports, container costs, price list.
- **Owner:** dashboard across all branches, approvals, reports, margins, receivables.
- **System Admin:** employees and roles, branches, logo and settings, audit log.
- **Public:** landing page, varieties, sack sizes, branches, contact, inquiry form.

## 8. Notifications

- Fund request waiting on you (Branch Accountant, Owner, General Accountant) and the result (requester)
- Low stock per SKU and branch (Warehouse, Branch Accountant)
- Low petty cash fund (custodian, General Accountant)
- Overdue installments (Branch Accountant)
- Container arrived or received, and transfer in transit (Warehouse, Branch Accountant)
- Supplier cost up while the selling price is not updated (Owner, General Accountant)
- New website inquiry (staff)

## 9. Still to confirm with the owner and accountant

- The permission matrix above
- Approval limits (for example, an amount above which a second approver is needed)
- Delivery Receipt and Official Receipt rules and numbering with the accountant, and whether any POS needs BIR registration
- Whether to show prices on the public website
- The list of branches, employees, opening stock and opening PCF amounts
