# KANTIRA Business OS — Phase 5 Master Recovery & Roadmap

**Status:** Discovery document, since superseded in part — see the
**"2026-08-29 addendum"** at the end of this file. This document's original
body (below) was written from **file-only** inspection of F: and was
accurate to that scope, but the live local database (`supabase start`)
was later found to contain schema/RPCs far beyond what any file on F:
describes. Read the addendum before treating anything below as the current
state of the project.

**Scope of this discovery:** read-only inspection of
`F:\Projects\KantiraBusinessOS` only — its four migrations, application
code, configuration, and git state. No other directory, drive, VHDX, or
project was used as a source of truth.

**Baseline at time of writing:**

```
git rev-parse HEAD  → e278bee6b92e3d76b563ea4911f31a2fdec766bb
git branch          → master
git status --short  → (clean)
remote               → none configured
```

---

## A. VERIFIED EXISTING

Everything in this section was read directly from the four migration files
and the application source tree in `F:\Projects\KantiraBusinessOS`.

### A.1 Git / repository state

- Single commit (`e278bee`), branch `master`, clean working tree, no remote.
- `supabase/migrations/`: exactly four files —
  `0001_phase1_foundation.sql`, `0002_phase2_business_core.sql`,
  `0003_phase3_transactions.sql`, `0004_phase4_inventory_valuation.sql`.
- No other SQL files anywhere in the repository.

### A.2 Schema — Phase 1 (`0001_phase1_foundation.sql`)

Tables: `organizations`, `profiles` (1:1 with `auth.users`, `role` +
`organization_id` not null), `stores` (`store_code`, `type` ∈
`COMPANY`/`FRANCHISE`), `employee_store_access` (join table, which staff
can act on which store).

Enums: `user_role` (`OWNER, ADMIN, STORE_MANAGER, SALES, STOCK,
ACCOUNTANT, FRANCHISE`), `store_type`.

Auth helper functions (`SECURITY DEFINER`, the only place org/role/store
logic lives): `current_org_id()`, `current_role()`,
`has_store_access(store_id)`.

Bootstrap RPC: `create_organization_with_owner(org_name)` — the only way an
organization and its first `OWNER` profile are created; no direct `INSERT`
policy exists on `organizations` or `profiles` for this purpose.

RLS: every table enabled, all policies scoped through `current_org_id()`;
a trigger (`guard_profile_privilege_columns`) blocks a non-admin from
elevating their own role/org/active-status even under their own
`profiles_update_self` policy.

### A.3 Schema — Phase 2 (`0002_phase2_business_core.sql`)

Tables: `product_categories` (self-referencing parent), `units_of_measurement`,
`items`, `customers`, `suppliers`, `chart_of_accounts`, `journal_entries`,
`journal_entry_lines`, `stock_movements`, `audit_log`.

**`items` columns:** `sku` (unique per org), `barcode` (unique per org where
not null), `name`, `description`, `category_id`, `uom_id`, `hsn_code`,
`cost_price`, `selling_price`, `tax_rate_percent`, `reorder_level`,
`track_inventory`, `is_active`. **No image/media columns of any kind.**

Double-entry accounting core: `chart_of_accounts` (`account_type`,
`normal_balance`, `control_type` ∈ `NONE/CUSTOMER/SUPPLIER/CASH/BANK`),
`journal_entries` + `journal_entry_lines` with a deferred constraint
trigger (`validate_journal_entry_balance`) that hard-enforces debit=credit
at commit time regardless of write path.

Only write path for the ledger: `create_journal_entry(...)` RPC — no direct
insert policy exists on `journal_entries`/`journal_entry_lines`.

**Inventory ledger:** `stock_movements` is append-only (no update/delete
policy anywhere, ever) — corrections are always an offsetting movement.
`stock_balances` is a `security_invoker` view, never a stored column — stock
on hand can never drift from the ledger by construction.
`create_stock_transfer(...)` is the only path to `TRANSFER_IN`/`TRANSFER_OUT`
rows.

`audit_log`: generic before/after JSON trail, written only by
`record_audit_log()` trigger, attached to `items`, `customers`, `suppliers`,
`chart_of_accounts`, `journal_entries`, `stock_movements`.

### A.4 Schema — Phase 3 (`0003_phase3_transactions.sql`)

Tables: `document_sequences` (per-org/store/type counter, row-locked —
never `MAX()+1`), `account_role_map` (maps `INVENTORY`/`SALES_REVENUE`
roles to real chart-of-accounts rows), `purchases`+`purchase_lines`,
`sales`+`sale_lines`, `purchase_returns`+`purchase_return_lines`,
`sales_returns`+`sales_return_lines`, `customer_receipts`,
`supplier_payments`.

Document lifecycle: `transaction_status` ∈ `DRAFT/POSTED/CANCELLED`.
Line totals are `generated always as` stored columns; header `subtotal`
is trigger-maintained from a live sum of lines
(`recalc_document_totals`); `total_amount` is trigger-derived from
`subtotal - discount + tax` (`recalc_document_total_only`) — never
client-supplied.

Posting RPCs (all `SECURITY DEFINER`, all row-lock the header with
`for update`, all role- and store-access-gated): `post_purchase`,
`post_sale`, `post_purchase_return`, `post_sales_return`,
`create_customer_receipt`/`cancel_customer_receipt`,
`create_supplier_payment`/`cancel_supplier_payment`. Each posts a balanced
journal entry via direct insert (same-transaction, not through the Phase 2
RPC) and the relevant `stock_movements` rows. `payment_method` ∈
`CASH/BANK/UPI/CARD/CREDIT/OTHER`; credit sales require a registered
customer and post to the customer control account instead of cash/bank.

Concurrency: `assert_stock_available()` takes a
`pg_advisory_xact_lock` keyed by `(store, item)` before checking/consuming
stock, so concurrent postings against the same store+item genuinely
serialize.

### A.5 Schema — Phase 4 (`0004_phase4_inventory_valuation.sql`)

Adds weighted-average costing on top of Phase 2/3 without altering their
tables: `item_store_costs` (running ₹ total value per org/store/item —
quantity is still always read live from `stock_balances`, never
duplicated), `stock_movement_costs` (immutable, one row per movement — the
permanent historical-cost record), `sale_line_movements` (links a sale
line to the exact movement it produced, so a later return can find its
*original* cost, never today's average).

New choke-point function: `record_stock_movement(...)` — every
cost-affecting movement from this phase forward goes through it; it takes
the same advisory lock as Phase 3, resolves unit cost (explicit for `IN`
if this is the first stock ever, current average otherwise; current
average for `OUT` unless an explicit historical cost is passed, e.g. a
purchase return), writes the movement + its cost row + updates
`item_store_costs` atomically.

Phase 3's five posting RPCs are **replaced** (`CREATE OR REPLACE`, same
signature) to route through `record_stock_movement()` and additionally
post COGS (`post_sale`: Dr COGS/Cr Inventory using the movement's actual
cost; `post_sales_return`: reverses using the *original sale's* historical
unit cost via `sale_line_movements`, never a recomputed average).

New RPC: `post_stock_adjustment(...)` — handles `ADJUSTMENT_IN`,
`ADJUSTMENT_OUT`, `DAMAGE`, with `stock_adjustment_reason` ∈
`DAMAGE/LOSS/FOUND/RECOUNT/OTHER`, posting to a single `INVENTORY_LOSS`
variance account.

Views (`security_invoker`, all derived, nothing stored): `inventory_valuation`,
`sale_line_cogs`, `sale_profitability`.

RLS tightening: `stock_movements_insert` (Phase 3's direct-insert policy)
is **dropped and not replaced** — every movement type is now RPC-only,
matching the posture `journal_entries` has had since Phase 1.

### A.6 Authentication & profiles

Supabase Auth (`auth.users`) is the only identity provider. Every
authenticated identity is a **staff member of exactly one organization** —
`profiles.organization_id` is `not null`. There is currently no concept of
an identity that is *not* staff (i.e., no customer-facing identity exists
at all).

### A.7 Application route structure (`app/`)

All routes below sit behind `middleware.ts`, which redirects any
unauthenticated request to `/login` (verified working this session via
curl — 307 redirects on every protected route).

```
/                        (redirect/landing)
/login, /signup           — staff auth
/auth/callback            — Supabase auth callback route handler
/dashboard
/accounts                 (+ [id]/edit)
/customers                (+ [id]/edit)
/suppliers                (+ [id]/edit)
/items                    (+ [id]/edit, /categories)
/sales                    (+ /new, /[id])
/sales-returns             (+ /new, /[id])
/purchases                 (+ /new, /[id])
/purchase-returns           (+ /new, /[id])
/payments                  (+ /new)
/receipts                  (+ /new)
/stock                     (+ /adjustments[+/new], /transfers[+/new])
```

There is **no public/unauthenticated route beyond `/login`, `/signup`, and
the root page** — no storefront, no product listing, no cart, no checkout,
no customer account area.

### A.8 UI / design system

Tailwind, custom brand tokens (`--kantira-primary-navy`,
`--kantira-royal-blue`, `--kantira-cyan`, `--kantira-purple`,
`--kantira-accent-teal`, `--kantira-slate`, plus a full `kantira-navy`/
`kantira-green` numeric scale), Poppins font, `lucide-react` icons.
Shared class strings in `lib/ui/form-classes.ts` (inputs, buttons, badges
for `DRAFT`/`POSTED`/`CANCELLED`). Layout shell: `components/kantira-shell.tsx`.
This is one internal-staff design system — no separate public-site theme
exists yet.

### A.9 Environment conventions (`.env.local.example`)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
# SUPABASE_SERVICE_ROLE_KEY   — documented as server-only, currently unset, never referenced in app code
```

### A.10 Package dependencies (`package.json`)

Runtime: `next@14.2.35`, `react`/`react-dom@18.3.1`, `@supabase/ssr`,
`@supabase/supabase-js`, `lucide-react`. Dev: `typescript`, `tailwindcss`,
`eslint` + `eslint-config-next`, `autoprefixer`, `postcss`. **No payment
SDK, no shipping/courier SDK, no image-upload library, nothing
mobile-related** (expected — a Flutter app would be a separate repository
regardless).

### A.11 Documentation, hidden files, backups (F: only)

- `docs/` did not exist before this document was created — `README.md`
  (setup instructions) is the only prior documentation in the repo.
- No `.backups/` or similar directory anywhere under
  `F:\Projects\KantiraBusinessOS`.
- No untracked files beyond what's gitignored (`node_modules`, `.next`,
  `dev_out.txt`, `tsconfig.tsbuildinfo`) — `git status --short` is clean.
- No hidden implementation of any later phase was found in `.git` object
  storage, working tree, or anywhere else in this repository.

---

## B. HISTORICAL REPORT CLAIMS — NOT PRESENT IN F:

Everything below was described in earlier reports **elsewhere in this
conversation** (referring to `C:\Projects\KantiraBusinessOS`, the
`KantiraDev.vhdx` snapshot, or `F:\StoreFlow`) and is **not present** in
`F:\Projects\KantiraBusinessOS` as verified above:

- Mobile / Flutter customer app (no `mobile/`, no `.dart` files, no
  `pubspec.yaml`)
- POS terminals / cash sessions
- Loyalty / rewards program
- Customer-facing commerce: cart, checkout, `/account`, order history
- Product media / image management (no image columns on `items`, no
  storage bucket reference anywhere)
- Shiprocket integration (no code, no env var, no reference)
- Razorpay or any payment gateway integration
- Migrations 0005–0025 (highest that exists anywhere in this repo is 0004)
- Any `PRIORITY_5B/5C/5D` documentation (the VHDX snapshot inspected
  earlier this session contained only `PHASE_2/3/4_MASTER_BLUEPRINT.md` —
  matching what's already built here — and no Phase 5 document at all)

None of the above should be assumed to exist, be reachable, or be
reusable. Section C below treats all of it as a clean-slate design
problem built *on top of* the verified foundation in Section A, not as
recovery of lost work.

---

## C. SAFE TO REBUILD FROM THE CURRENT FOUNDATION

| Capability | Foundation readiness |
|---|---|
| **Inventory deduction on sale** | **Already solved.** `post_sale()` already deducts stock atomically at accurate weighted-average cost via `record_stock_movement()`. An online order that becomes a `POSTED` sale gets this for free — no new inventory logic needed. |
| **Accounting posting (COGS/revenue)** | **Already solved**, same mechanism. |
| **Document numbering** | `next_document_number()` already handles safe concurrent sequence allocation; reusable as-is for any new document type by adding an enum value to `document_sequence_type`. |
| **Multi-store fulfillment bookkeeping** | Store/stock model already supports it; only "which store fulfills an online order" is undecided (see D.9). |
| **Product catalog data** | `items` already has the commercial fields (SKU, pricing, tax, category, UOM) a storefront needs to *read*. It has nothing a storefront needs to *serve publicly* (see D.3, C below). |
| **Public storefront** | Needs a new, deliberately narrow RLS surface — the existing `items_select` policy requires `organization_id = current_org_id()`, which only resolves for an authenticated staff member. An anonymous customer has no `current_org_id()`. This must be a new, explicitly-scoped anonymous-read policy (or a public view), not a relaxation of the existing one. |
| **Customer identity** | The existing `customers` table is B2B-style master data (billing contact for invoicing) with **no auth linkage at all** — no `auth_user_id` column, and `created_by` requires an existing staff profile. It cannot be reused directly as a customer-login identity; see D.1. |
| **Product images** | Clean addition — new table or columns + a Supabase Storage bucket + RLS. Nothing to conflict with. |
| **Online orders** | The `sales`/`sale_lines` schema is proven and should remain the eventual system of record for anything that's actually been sold — but it has no concept of shipping address, channel, or a pre-payment/pre-confirmation state. Recommend a *new* `online_orders` layer that becomes a `sales` row at the point of fulfillment/posting, the same additive pattern every phase so far has used (see D.5). |
| **Shipping / Shiprocket / COD / fulfillment** | Entirely new domain, no prior art to preserve or conflict with. Must be server-only (see D.10). |
| **Android app** | Clean-slate rebuild. Nothing exists to preserve. |

---

## D. ARCHITECTURAL RISKS / DECISIONS NEEDED

1. **Customer identity model.** `profiles.organization_id` is `not null`
   and represents *staff membership* in an org — that shape cannot
   represent "a customer of this org." Recommend a new `customer_profiles`
   table (1:1 with `auth.users`, like `profiles`, but with a *belongs-to
   many orgs as a buyer* or *scoped to one org* relationship depending on
   whether Kantira is single-tenant retail or a marketplace — needs your
   confirmation) rather than overloading `profiles`.

2. **RLS authorization path for customers.** Every existing RLS policy is
   built on `current_org_id()`/`current_role()`, which only resolve for a
   row in `profiles`. A parallel set of helper functions
   (e.g. `current_customer_id()`) and entirely separate policies are
   needed for any table a customer touches directly (their own orders,
   addresses, cart). This is new authorization surface, not an extension
   of the existing one — get it reviewed before writing RLS for it, the
   same care Phase 1–4 evidently took.

3. **Customer-facing price.** `items.selling_price` is a single value.
   Decide: is that also the online price, or does online pricing need to
   diverge from in-store (promotions, MOQ, etc.)? No `customer_price` /
   price-list concept exists today.

4. **Product variants.** No variant concept exists anywhere in the schema
   (no size/color axis on `items`). Confirm whether Phase 5 needs it —
   it changes the shape of both the catalog and the cart/order-line
   design substantially if yes.

5. **Order → Sale mapping.** Recommend a new `online_orders` +
   `online_order_lines` pair with its own lifecycle
   (`PLACED → PAYMENT_CONFIRMED/COD_CONFIRMED → FULFILLED → SHIPPED →
   DELIVERED`, plus `CANCELLED`/`RETURNED`), which produces a `sales` row
   (via the *existing, unmodified* `post_sale()`) at the point stock is
   actually committed — keeping the proven accounting core completely
   untouched, consistent with every phase's "additive, never destructive"
   pattern so far.

6. **Shipping rate timing.** A Shiprocket rate/serviceability check is a
   live external call needed *before* an order is placed (at cart/checkout
   time for the total-with-shipping figure). Needs a server-only proxy
   endpoint with caching/rate-limit handling — never called from the
   browser or the Android app directly.

7. **COD availability.** Must be resolved server-side per delivery pincode
   via Shiprocket at checkout time, not a static per-item or per-org flag.

8. **Payment gateway scope.** The brief in this message describes COD via
   Shiprocket but does not explicitly request prepaid online payment.
   Earlier historical reports (Section B) mentioned Razorpay. **Confirm
   explicitly** whether prepaid card/UPI payment is in scope for this
   Phase 5, or COD-only for now with prepaid as a later phase — this
   materially changes D.5's status lifecycle and D.11's webhook surface.

9. **Fulfilling store selection.** No existing concept of "which store
   serves this pincode/region" — needs a decision (single default
   fulfillment store vs. nearest-store logic vs. manual assignment).

10. **Credential handling.** Shiprocket's API uses a login call
    (email/password) that returns a bearer token — this exchange and the
    token itself must live entirely server-side (a Next.js Route Handler
    or Server Action), never in a `NEXT_PUBLIC_*` variable, never returned
    to browser or Android client JS. No credentials were requested,
    stored, or printed during this discovery, per your instruction.

11. **Webhook handling.** Shiprocket will push shipment status changes to
    a webhook. That endpoint is necessarily public but must verify
    authenticity (signature/shared-secret check) before writing anything,
    and should update order/shipment status through a `SECURITY DEFINER`
    RPC rather than a direct table write from an unauthenticated context.

12. **Migration numbering.** Recommend continuing sequential numbering
    from the real current state — **`0005` onward** — rather than
    resuming any historical `0005`–`0025` numbering. Those numbers
    referred to work that was never actually implemented in *this*
    repository; reusing them would misrepresent this repo's real
    migration history.

---

## E. PROPOSED PHASE 5 ROADMAP (dependency-ordered)

Matches the dependency chain given in the brief; each step is additive
only, following the pattern every prior phase has already established
(new tables/enums/functions, `CREATE OR REPLACE` where an existing
function's behavior must extend, never an `ALTER TYPE`/destructive change
to 0001–0004).

1. **0005 — Customer identity.** `customer_profiles` (or equivalent) +
   its own RLS helper functions. *Blocks everything else — resolve D.1/D.2
   first.*
2. **0006 — Public storefront read model.** Anonymous-safe catalog
   exposure (new policy or view) scoped explicitly to what's meant to be
   public — never a relaxation of `items_select`.
3. **0007 — Product media.** Image table/columns + Storage bucket + RLS.
4. **0008 — Cart.** Decide client-only vs. server-persisted (D.4 variant
   decision affects this); if persisted, `carts`/`cart_items`.
5. **0009 — Customer addresses.** `customer_addresses`, linked to
   `customer_profiles`.
6. **0010 — Shipping quote integration.** Server-only Shiprocket
   serviceability + rate proxy (D.6, D.10).
7. **0011 — Payment/COD decision layer.** Depends on D.8 being answered.
8. **0012 — Online orders.** `online_orders` + `online_order_lines`
   (D.5), referencing customer/address/items.
9. **0013 — Fulfillment linkage.** `shipments` (Shiprocket order id, AWB,
   status) linked to `online_orders`.
10. **0014 — Inventory + accounting wiring.** Connect online-order
    posting to the *existing, unmodified* `post_sale()` /
    `record_stock_movement()` — no new inventory or ledger logic, pure
    integration.
11. **0015 — Shiprocket shipment creation.** Server-only push once
    payment/COD is confirmed.
12. **0016 — Tracking / webhooks.** Signature-verified receiver (D.11)
    syncing status back to `online_orders`/`shipments`.
13. **0017 — Customer Android app.** Clean Flutter rebuild against the
    same Supabase project, using the customer-scoped RLS from step 1
    plus a thin server API for anything Shiprocket-dependent.
14. **0018 — Production hardening.** Rate limiting on public endpoints,
    webhook signature verification review, checkout load testing,
    alerting for failed Shiprocket calls.

---

## Validation

**Files inspected:**
`supabase/migrations/0001_phase1_foundation.sql`,
`0002_phase2_business_core.sql`, `0003_phase3_transactions.sql`,
`0004_phase4_inventory_valuation.sql`, full `app/` tree (listed in A.7),
`lib/actions/auth.ts`, `lib/data/get-org-id.ts`, `lib/supabase/*.ts`,
`lib/ui/form-classes.ts`, `components/*.tsx`, `tailwind.config.ts`,
`package.json`, `.env.local.example`, `README.md`, `.gitignore`, current
`git` state.

**Exact current migration range:** `0001`–`0004`. No `0005+` exists
anywhere in this repository.

**Exact current route range:** listed in full in A.7 — 12 top-level
authenticated modules plus `/login`, `/signup`, `/auth/callback`, and the
root page. No public/customer-facing route exists.

**Exact existing DB/RLS/RPC capabilities:** summarized in full in A.2–A.5.
Every write path outside plain CRUD on master data goes through a
`SECURITY DEFINER` RPC; the accounting ledger and stock ledger are both
provably append-only/balanced by database-level constraints and triggers,
not application trust.

**Exact missing pieces:** all of Section B.

**Proposed next phase:** `0005` — customer identity (Section E, step 1).
This is the correct starting point because every other step in the
dependency chain in the brief (storefront → cart → address → ... →
Android app) requires *someone to be identified as a customer* before it
can be meaningfully scoped by RLS.

**STOP conditions:** implementation should not begin until D.1 and D.2
(customer identity + its RLS model) are explicitly decided — they are
the foundation every subsequent step depends on — and D.8 (payment
gateway scope) is confirmed, since it changes the shape of the order
status lifecycle designed in step 8.

---

## FINAL GATE

**AMBER** — discovery is complete and the roadmap above is ready, but
implementation should not start until the decisions in Section D
(numbered 1–12, particularly 1, 2, and 8) are explicitly resolved.

No implementation was performed. No migrations were created. No
application code was modified. No database was changed. This document is
the only file added.

---

## 2026-08-29 addendum — the local database already has all of this, and more

While implementing "Priority 5A customer identity foundation" as a
follow-up task, `supabase start` was run for the first time this session
(Docker had not previously been running). The resulting live local
Postgres instance (`supabase_db_KantiraBusinessOS`) was found to have
**ten migrations beyond what any file on F: describes**, tracked in
`supabase_migrations.schema_migrations`:

```
0001  phase1_foundation                        (matches the file on disk)
0002  phase2_business_core                      (matches the file on disk)
0003  phase3_transactions                       (matches the file on disk)
0004  phase4_inventory_valuation                 (matches the file on disk)
0005  phase4_record_stock_movement_authz_fix     — NOT on disk anywhere on F:
0006  phase3_cross_org_reference_integrity       — NOT on disk anywhere on F:
0007  customer_loyalty_rewards                   — NOT on disk anywhere on F:
0008  priority4d_cash_sessions                   — NOT on disk anywhere on F:
0009  priority5a_customer_auth_linkage           — NOT on disk anywhere on F:
0010  priority5a_public_catalog_read             — NOT on disk anywhere on F:
0011  priority5a_public_catalog_grants           — NOT on disk anywhere on F:
0012  priority5a_public_catalog_org_check        — NOT on disk anywhere on F:
0013  priority4d_cash_session_grants             — NOT on disk anywhere on F:
0014  customer_identity_audit_attribution        — NOT on disk anywhere on F:
```

The live schema includes tables this document's Section B explicitly said
were absent: `loyalty_accounts`, `loyalty_balances`, `loyalty_programs`,
`loyalty_transactions`, `pos_terminals`, `cash_sessions`, `online_orders`,
`online_order_lines`, `payment_intents`, `payment_events`,
`product_media`, `customer_addresses`, `store_shipping_config`,
`stock_reservations`, `available_to_sell` — plus `customers.auth_user_id`
with a working self-access RLS policy, and a live, already-correct
`claim_customer_identity()` RPC (verified by direct testing, see below).
Real data already exists too: 5 organizations (including one flagged
`is_public_storefront`, and one literally named "UAT 5B1 Dual Identity
Org" — evidence a prior session already tested this exact feature under
Priority-5B numbering), 8 profiles, 10 customers.

**This means Section A/B of this document, while an accurate description
of the *files on F:* at the time it was written, was never a complete
description of the *project*.** The migration files for 0005–0014 exist
nowhere on F: (checked: `supabase/migrations/`, git history including
dangling blobs, the whole F: filesystem sweep, and the recovered VHDX
snapshot, per the earlier discovery session) — only their effects,
persisted in this local database's actual tables and in Postgres's own
migration-tracking table, survived.

**Protective action taken, nothing else:**
1. Full `pg_dump` backup of the live local database taken immediately:
   `db_backups/kantira_local_full_20260829_115247.sql` (1.2 MB, schema+data).
2. The original SQL text for migrations 0005–0013 was recovered intact
   from `supabase_migrations.schema_migrations.statements` and saved to
   `db_backups/recovered_migrations/000N_<name>.sql`. **Migration 0014
   could not be recovered this way** — its `statements` column is empty
   (applied via `psql -f` directly rather than the tracked `supabase
   migration` flow, per a comment left in its own recovered stub file);
   its effect is still fully visible by inspecting the live schema
   (`audit_log.changed_by_customer_id`, its `audit_log_single_actor_chk`
   constraint, and the FK to `customers`), just not as original file text.
3. `claim_customer_identity()` (the exact RPC the Priority 5A task asked
   for) was inspected and then **verified by direct SQL/RLS testing**
   against the live database, using isolated test fixtures
   (`zzregtest-*@example.com` / `ZZREG-*` codes) that were fully cleaned
   up afterward (verified zero residue, including in `audit_log`). All of
   the following passed on the **first architecturally-correct attempt**
   (two earlier attempts failed only on malformed test-fixture UUIDs, not
   on anything in the schema being tested):
   - `anon` role has no execute grant on `claim_customer_identity()`.
   - An authenticated user with no linked customer row sees zero rows
     from `customers` and zero from `profiles`.
   - The correct customer, with a verified (`email_confirmed_at is not
     null`) email matching an unclaimed `customers` row in the real
     primary storefront org, successfully claims it — and the link
     persists.
   - After claiming, that customer can read exactly their own customer
     row and nothing else — zero visibility into `profiles`,
     `journal_entries`, `stock_movements`, `purchases`, or `suppliers`.
   - Re-claiming (already linked) returns `null`, not an error and not a
     second link — idempotent.
   - No email match returns `null`.
   - An unconfirmed email returns `null` and leaves the row unlinked.
   - A same-email customer row that exists only in a **different**
     organization is never reachable — `primary_storefront_org_id()`
     resolves to exactly one org, so cross-org claiming is structurally
     impossible, not just policy-blocked.
   - A direct client `UPDATE customers SET auth_user_id = ...` affects
     zero rows under RLS — no policy grants that write.
   - An employee (`OWNER`) still sees exactly their own org's customers
     and none of another org's — employee RLS is provably unchanged.
   - The claim action correctly wrote an `audit_log` row via
     `changed_by_customer_id` (proof migration 0014's attribution
     mechanism works), which is exactly why cleanup required deleting
     those audit rows before the test customer rows themselves.

**Nothing was implemented in this task.** No new migration was written,
no new application code was added, `supabase db reset` /
`db push` / `migration new` / `migration up` were never run, and neither
the original F: VHDX, C:, nor StoreFlow were touched. The already-existing
`claim_customer_identity()` was called only inside rolled-back or
fully-cleaned-up test transactions.

**Recommended next step is a decision, not code:** decide what to do about
the gap between the git repository (0001–0004, matches `HEAD e278bee`)
and the live database (0001–0014). Plausible options — restore
0005–0014 into `supabase/migrations/` and commit them (files are
recovered and ready for review in `db_backups/recovered_migrations/`,
except 0014's exact original text); reconstruct 0014 from the live
schema; or treat the live database as provisional and rebuild
deliberately. This is exactly the kind of repository-vs-environment
inconsistency the original Priority 5A task's own STOP conditions called
out — implementation should not proceed further until you choose.
