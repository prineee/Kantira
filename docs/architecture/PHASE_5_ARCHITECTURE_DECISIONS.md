# KANTIRA Business OS — Phase 5 Architecture Decision Gate

**Repository:** `F:\Projects\KantiraBusinessOS`
**Baseline:** git `8bd3cd2`, working tree clean, migrations 0001–0017 committed,
`types/database.ts` regenerated and `tsc --noEmit` clean.
**Scope of this document:** read-only inspection of the current repository
(all 17 migrations, `app/`, `lib/`, `middleware.ts`, `package.json`,
`supabase/config.toml`) plus the findings already recorded in
`PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md`. **No code, migration, or schema
was written or changed to produce this document.**

---

## 1. Executive decision summary

The recovery work (0005–0017) turned out to have already built most of the
customer-commerce *data layer* — customer identity linkage, public catalog
read access, product media, addresses, online orders, stock reservations,
payment intents/events, and a working fulfillment-store allocator — none of
it wired into `app/` yet, and none of it exercised by a real signup/checkout
flow. This is further along than a "Phase 5 hasn't started" read would
suggest, but it is **not** production-ready as-is. Three concrete gaps stop
it short of GREEN:

1. **New-customer registration has no path.** `customers.created_by` is
   `not null references public.profiles(id)` and no INSERT policy exists
   for a customer identity — `claim_customer_identity()` can only link an
   auth identity to a *pre-existing* customer row (created by staff, e.g.
   from an in-store sale). Someone who has never bought in-store cannot
   create an online account today. This blocks Decision 1's own
   "customer registration" requirement and needs a schema decision before
   any signup UI is worth building.
2. **No organization is durably confirmed as the public storefront.** The
   `is_public_storefront` flag exists and auto-sets only in the
   single-organization case; this database already has multiple
   organizations (test/UAT orgs from prior sessions), so it is not
   automatically set today. An OWNER must explicitly flag exactly one org
   before `primary_storefront_org_id()` (which every public-facing RPC
   depends on) resolves to anything.
3. **Payment gateway scope was never confirmed**, and no Shiprocket/Razorpay
   credential, code, or verification exists anywhere in this repository
   (confirmed by grep across the full tree — the only two hits for
   "Shiprocket" are this document's own family and the recovery report).
   Whatever was verified previously, if anything, was not done in a way
   that left evidence in this codebase; treat Decision 6 accordingly.

**Recommended launch shape** (detailed in the sections below): reuse the
existing customer-identity and fulfillment schema almost entirely as-is,
launch **COD-only**, treat Shiprocket integration as fully unverified until
a sandbox account is actually exercised, and fix the registration gap with
one small additive migration before writing any signup UI.

**FINAL STATUS: AMBER** — see Section 13 for the exact list of decisions
that need your sign-off.

---

## 2. Customer identity decision

### 2.1 What already exists (verified against 0007–0015)

- `customers` (Phase 2, B2B-style master data) gained `auth_user_id uuid
  references auth.users(id)` in 0009, unique per
  `(organization_id, auth_user_id)`.
- `claim_customer_identity()` (SECURITY DEFINER): given the calling
  `auth.uid()`, finds a *verified* email (`auth.users.email_confirmed_at is
  not null`) matching exactly one unclaimed `customers` row in
  `primary_storefront_org_id()`, and links it. Idempotent, cross-org-proof
  by construction (only ever resolves one org), returns `null` on no match
  or already-claimed. This was empirically verified (isolated test
  fixtures, cleaned up) per the recovery report's test log — the one part
  of this whole surface with real test evidence behind it.
- RLS: `customers_select_self`, `loyalty_accounts_select_self`,
  `loyalty_transactions_select_self`, plus (0015) self `SELECT`/`INSERT`/
  `UPDATE`/`DELETE` on `customer_addresses` and self `SELECT` on
  `online_orders`/`online_order_lines`/`stock_reservations`/
  `payment_intents` — all scoped via `EXISTS (... customers c WHERE
  c.auth_user_id = auth.uid())`, never via `current_org_id()`.
- Public catalog read (`items`, `product_categories`,
  `units_of_measurement`, `product_media`) is scoped through
  `is_org_public_storefront(organization_id)`, a SECURITY DEFINER helper —
  not a relaxation of the staff `..._select` policies, an OR'd addition.

### 2.2 Why staff auth is already safe from this

`requireOrgContext()` (`lib/actions/auth.ts`) — the single helper every
staff server action calls — looks up `profiles` by `auth.uid()` and returns
`"Not authenticated"` if no profile row exists. A customer identity has no
`profiles` row by construction, so every existing staff action already
fails closed for a customer session with **zero code change**. The
converse must hold too: no new customer-facing code may call
`requireOrgContext()`, `current_org_id()`, or `current_role()` to establish
a customer's identity — those three only ever resolve for staff. This is
the one rule that must not be violated going forward.

### 2.3 The recommended production model

**Keep the existing model. Do not build a parallel `customer_profiles`
table** — the roadmap doc's Section D.1 raised that as an option before
0009–0015 were known to exist; they make it unnecessary. `customers` +
`auth_user_id` + a dedicated set of self-access RLS policies is already the
right shape and is already partially proven.

**Complete authorization flow (as designed, gap noted in 2.4):**

```
auth.users (Supabase Auth, email/password or OTP — same project as staff)
    │
    │  claim_customer_identity()  [existing row match]
    │  register_customer_identity()  [NEW — see 2.4, no existing row]
    ▼
customers.auth_user_id  (org-scoped: primary_storefront_org_id())
    │
    ├─► customer_addresses  (self CRUD, RLS: customers.auth_user_id = auth.uid())
    ├─► loyalty_accounts / loyalty_transactions  (self SELECT only)
    │
    ▼
catalog read (anon OR authenticated-customer — identical policy,
              is_org_public_storefront(organization_id))
    │
    ▼
cart  (client-only recommended — see 2.5)
    │
    ▼
create_online_order()  →  online_orders + online_order_lines
    (re-derives customer_id from auth.uid(), never trusts a client-supplied one)
```

- **Customer → organization relationship:** single-org today by
  construction (`primary_storefront_org_id()` returns exactly one row).
  This is correct for Kantira's current single-tenant retail shape; do not
  generalize to multi-org-per-customer unless Kantira actually becomes a
  marketplace — that would be a different RPC contract, not a small change.
- **Customer → store relationship:** none, by design. A customer never
  selects a store; `fulfillment_store_id` is resolved server-side (Decision
  3). This is correct — do not add a store picker to checkout.
- **Anonymous browsing:** works today at the RLS/grant layer
  (`items_select_public`, `product_media_select_public`, `anon` table
  grants in 0011/0015) but is **currently blocked by `middleware.ts`**,
  which redirects every unauthenticated request except `/login`, `/signup`,
  `/auth/*` to `/login`. Any public storefront route (`/shop`,
  `/product/[id]`, `/cart`) must be added to that route's public allowlist
  before this matters — a one-line middleware change, but a required one,
  and easy to forget since nothing about it lives in the database.
- **Authenticated customer browsing:** identical catalog visibility to
  anonymous (same RLS policies grant both `anon` and `authenticated`) —
  the only difference authentication buys is cart/order persistence and
  loyalty visibility.
- **Order ownership:** `online_orders`/`online_order_lines` self-`SELECT`
  policies already correctly scope by `customers.auth_user_id`, not by
  organization. Reuse as-is.
- **Cross-organization isolation:** already structurally sound —
  `primary_storefront_org_id()` resolves to exactly one org, so a customer
  physically cannot address another organization's catalog or orders
  through any of the recovered RPCs, confirmed by the recovery session's
  own cross-org test.

**Reuse as-is:** `customers.auth_user_id`, `claim_customer_identity()`,
`primary_storefront_org_id()`, `is_org_public_storefront()`,
`customer_addresses` + its RLS, `create_online_order()`,
`cancel_online_order()`, all self-`SELECT` policies on
`online_orders`/`online_order_lines`/`stock_reservations`/
`payment_intents`.

**Do not reuse:** `profiles`, `current_org_id()`, `current_role()`,
`requireOrgContext()`, `has_store_access()` — none of these should ever be
called from customer-facing code, and none of them can be (they all
resolve to `null`/`false` for a customer session, so misuse fails closed
rather than leaking, but don't rely on that as your only safeguard).

### 2.4 The registration gap (needs a decision, not code, right now)

`claim_customer_identity()` only *links* an auth identity to a customer row
that **already exists** (created by staff, e.g. the customer bought
in-store once and their email was recorded). It returns `null` for anyone
with no matching row — meaning **a person who has never interacted with a
physical Kantira store cannot create an online account today.** The
`customers` table's own `created_by uuid not null references
profiles(id)` makes a direct customer self-INSERT impossible without a
schema change (that FK requires a staff profile id).

This needs your decision, not implementation, right now:

- **Option A:** extend the existing RPC (`register_customer_identity()` or
  similar) so that when no unclaimed match exists, it creates a *new*
  `customers` row scoped to `primary_storefront_org_id()`, self-attributed
  (requires making `created_by` nullable or adding a
  `created_via_self_signup boolean` marker — an additive migration).
- **Option B:** launch with staff-created-customer-only signup (a customer
  must have bought in-store at least once, or a staff member must
  pre-create their record) and defer self-registration to a later phase.

Recommendation: **Option A**, because a public storefront whose signup flow
silently fails for anyone without in-store history is not a real launch —
but this is exactly the kind of schema decision this document is supposed
to surface rather than make for you.

### 2.5 Cart

No cart table exists, and none should be added reflexively. Recommend
**client-only cart** (localStorage/sessionStorage on the storefront,
device-local state on the Android app), converted to `online_order_lines`
only at `create_online_order()` time via the existing RPC's `p_lines jsonb`
parameter — which already re-validates every item's price/tax/availability
server-side at that moment, so a stale or tampered client cart cannot
misprice an order. A persisted server-side cart only becomes worth its
complexity if cross-device cart sync becomes an actual product requirement
— it isn't implied by anything in this brief.

---

## 3. Payment decision

### 3.1 What exists today

`payment_intents` (`provider ∈ {RAZORPAY, COD}`, `status ∈ {CREATED,
AUTHORIZED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED}`) and
`payment_events` (append-only, `unique(provider, provider_event_id)` —
webhook-idempotency-ready) already model both paths in one schema. Neither
table has a single line of application code, credential, or SDK dependency
anywhere in this repo (`package.json` has no payment SDK; grep for
"razorpay" across the tree matches only this document family). Whatever
gateway work was "previously verified" was not verified inside this
repository — treat it as unverified here regardless of what happened
elsewhere.

`online_orders.payment_status` is independent of `online_orders.status` —
confirmed by the schema's own check constraints and by
`cancel_online_order()`, which explicitly blocks cancellation once
`payment_status = 'PAID'` ("requires a refund, which is not yet
available"). This means the *order* state machine already assumes payment
can lag behind order status, which is the right shape for either launch
model.

### 3.2 Comparison

| | A. COD-only | B. Razorpay + COD | C. Razorpay-first, COD fallback |
|---|---|---|---|
| Implementation complexity | Low — no gateway SDK, no webhook signature verification, no card data ever touches the app | High — Razorpay checkout SDK, server-side order creation, signature-verified webhook, reconciliation | High, plus extra UX work to make COD feel like a fallback rather than an equal choice |
| Security surface | Minimal — nothing sensitive to protect beyond what already exists | New: webhook authenticity, PCI-adjacent handling (mitigated by Razorpay Checkout being hosted, but the integration boundary is still new attack surface) | Same as B |
| Payment state machine | Trivial: `payment_status` stays `PENDING` until delivery-confirmed COD collection is recorded by staff | Full use of `payment_intents`/`payment_events` as designed | Full use, plus a decision path for "online payment failed — offer COD?" |
| Refunds | Essentially none needed pre-launch (nothing was ever charged) | Real requirement from day one — not yet designed anywhere in this schema | Real requirement from day one |
| Failed payments | Not applicable | Must be handled (retry, abandon, fall back to COD manually) | Must be handled as a first-class flow |
| Webhook handling | None needed | Required, unverified (see Decision 6) | Required, unverified |
| Accounting integration | Trivial — a COD sale posts through the existing, unmodified `post_sale()` exactly like an in-store cash sale once fulfilled | Needs a decision: post at `CAPTURED` webhook time or at fulfillment time — not yet decided anywhere | Same open decision as B |
| Customer experience | Slightly worse (no online payment, COD-only) | Best, if it works | Best, with a safety net |
| Launch risk | **Low** | **High** — untested gateway + untested webhook auth going live with real money on day one | **High**, same root cause as B |

### 3.3 Recommendation

**A — COD-only launch.** The schema already supports adding Razorpay
later purely additively (that's the entire point of `payment_intents`
having a `provider` column already) — nothing about launching COD-only
forecloses B or C afterward. The reverse is not true: launching with an
unverified gateway integration and an unverified webhook trust mechanism
(Decision 6) is the highest-risk item in this entire brief, and COD removes
it from the critical path entirely without touching architecture. This
matches the pattern every phase in this codebase has already used —
ship the narrowest safe slice, extend additively once it's proven in
production.

### 3.4 If/when Razorpay is added, verify before implementation

1. Razorpay Checkout's exact client-side integration contract for this
   Next.js App Router version (order-creation must happen server-side via
   a Server Action/Route Handler, never client-side, to keep the key
   secret server-only).
2. The exact webhook payload shape and signature scheme (HMAC-SHA256 over
   the raw body with a webhook secret, per Razorpay's own docs at
   implementation time — do not assume today's public docs without
   re-checking, gateway webhook contracts change).
3. Idempotent webhook processing against `payment_events`'s existing
   `unique(provider, provider_event_id)` constraint — confirm Razorpay's
   event id is stable and unique before relying on it for that constraint.
4. Whether `post_sale()` should fire at `CAPTURED` (webhook-confirmed) or
   only at fulfillment/dispatch time — this is a real product decision
   (revenue recognition timing), not an implementation detail.
5. Refund flow end-to-end, including how a refund reverses loyalty points
   already earned on that sale (the existing
   `loyalty_reverse_on_sales_return_posted()` trigger only fires on a
   `sales_returns` posting — a pure payment refund with no physical return
   is a case that trigger does not cover).

---

## 4. Fulfillment-store decision

### 4.1 What already exists (verified against 0015)

`auto_allocate_online_order_store(p_order_id)`:
- Idempotent — a store already holding an ACTIVE reservation is returned
  immediately; a manually-assigned-but-unreserved store is tried first,
  respecting staff override.
- Otherwise walks active stores in the order's organization, preferring
  ones with an active `store_shipping_config` row, then by
  `created_at`/`store_code` for determinism.
- For each candidate: assigns + calls `reserve_all_lines_at_store()` inside
  an implicit sub-transaction (`exception when others then continue`) — if
  any line fails (insufficient stock), the whole candidate is abandoned and
  the next is tried. **All lines must be satisfiable at one store — there
  is no split-store fulfillment for a single order.**
- If no candidate works, `fulfillment_store_id` stays `null` — a truthful
  "needs manual resolution" state, never a false-positive confirmation.

`assign_online_order_store()` lets `OWNER`/`ADMIN`/`STOCK`(with store
access) manually (re)assign any time before `PROCESSING` begins.
`reserve_online_order_stock()` releases a stale reservation and re-reserves
if the assigned store changed since the last reservation — so manual
reassignment is safe even after an earlier auto-allocation.

`assert_stock_available()` (modified in 0015) takes the same
`pg_advisory_xact_lock` keyed by `(store, item)` used everywhere else in
this schema, and subtracts active `stock_reservations` from physical stock
— so an in-store POS sale and a concurrent online reservation against the
same store+item genuinely serialize; there is no window for both to
succeed against stock that only covers one of them.

`advance_online_order_status(order_id, 'CONFIRMED')` automatically calls
`auto_allocate_online_order_store()` as a best-effort side effect (failure
inside it never rolls back the CONFIRMED transition itself — "CONFIRMED
means payment/acceptance, not fulfillment secured," per the function's own
comment).

### 4.2 Recommendation

**Reuse the existing algorithm exactly as built. Do not design a new
fulfillment system** — it already covers points 1–8 and 12 from the
brief correctly:

1. Shipping address → not used for store selection at all today (see
   4.3 — this is the one real gap).
2. `store_shipping_config.active` → soft priority signal, not a hard
   filter (see 4.3).
3–5. Item availability / available-to-sell / reservation → fully covered
   by `available_to_sell`, `assert_stock_available()`,
   `stock_reservations`.
6. Store priority → deterministic ordering by shipping-config presence,
   then `created_at`, then `store_code`.
7. Automatic allocation → `auto_allocate_online_order_store()`.
8. Manual reassignment → `assign_online_order_store()`, gated to
   `OWNER`/`ADMIN`/`STOCK`-with-access.
12. Race conditions → advisory-lock-serialized, same mechanism as every
   other stock-affecting path in this schema since Phase 3.

**Two things the existing design deliberately does not do (9, 10, 11) —
confirm this is acceptable for v1, don't silently build around it:**

- **9. Multi-line orders across stores:** not supported — an order is
  fulfilled entirely from one store or not at all. For a small number of
  physical stores this is very likely the right v1 answer (split shipments
  double the shipping cost and Shiprocket complexity for a benefit that may
  never materialize) — recommend keeping this constraint and revisiting
  only if real order data shows it's actually costing sales.
- **10. Partial fulfillment:** no per-line fulfillment status exists —
  `online_orders.status` is order-level only. Same recommendation: don't
  build it speculatively.
- **11. Out-of-stock behavior:** today, "no store can cover this order" →
  `fulfillment_store_id` stays `null`, order stays `CONFIRMED` with no
  further automated progress. There is no customer-facing signal for this
  state yet (no notification, no automatic partial-cancel-and-refund offer)
  — this needs a staff-facing "orders needing manual store assignment"
  view at minimum before launch, or these orders will silently stall.

### 4.3 One real gap worth fixing before it matters: shipping-address awareness

`auto_allocate_online_order_store()` never looks at
`online_orders.shipping_address_id` — it has no geographic reasoning at
all. Today, with Shiprocket not wired up, this is invisible (any active
store is treated as equally able to ship anywhere). The moment Shiprocket
serviceability becomes real, a store outside a pincode's serviceable
radius could still get auto-selected and then fail to actually book a
shipment. Recommend: when Shiprocket integration lands (Decision 6), turn
`store_shipping_config.active` from a soft priority signal into a hard
"only consider stores whose Shiprocket pickup location can actually serve
this address's pincode" filter, checked via a live serviceability call
before allocation — not before. This is a schema/RPC change for a later
migration, not something to build now.

---

## 5. Website / mobile / staff responsibility matrix

| Function | Website (kantira.in) | Android app | Staff/admin web |
|---|---|---|---|
| Catalog browse | Yes (anon + authenticated) | Yes (customer-auth required or anon, per product decision) | Yes (existing `/items`) |
| Product images | Yes | Yes | Yes (upload/manage) |
| Search | Yes | Yes | N/A (existing item list filters suffice) |
| Product details | Yes | Yes | Yes (existing `/items/[id]/edit`) |
| Cart | Yes (client-only) | Yes (client-only) | No |
| Checkout | Yes | Yes | No |
| Customer account | Yes | Yes | No |
| Addresses | Yes | Yes | Staff can view (`customer_addresses_select_staff`, OWNER/ADMIN only) |
| Order history | Yes (self) | Yes (self) | Yes, org-wide (`online_orders_select_staff`) |
| Order tracking | Yes (self) | Yes (self) | Yes, plus status transitions |
| Staff inventory / stock | No | No | Yes (existing `/stock`) |
| Product management | No | No | Yes (existing `/items`) |
| Fulfillment management (assign store, advance status) | No | No | Yes — `assign_online_order_store`, `advance_online_order_status` |
| Payment management | No (customer only sees their own status) | No | Yes, OWNER/ADMIN/ACCOUNTANT (`payment_intents_select_staff`) |

**Hard rule carried over from the brief:** the Android app authenticates
only as a customer (`customers.auth_user_id`), never as staff. Nothing in
the recovered schema or RLS gives a mobile client any way to obtain a
`profiles`-based session differently from the website, so this is already
naturally enforced — there is no separate "mobile auth" surface to
accidentally build wrong. If staff ever need a mobile experience, that is
a separate, explicitly-approved project (e.g. a thin wrapper around the
existing staff web app, or a real native staff app with its own review) —
not a mode flag on the customer app.

---

## 6. Product-media decision

### 6.1 Confirmed flow, as built (0015)

```
Staff/Admin website (OWNER/ADMIN/STOCK only)
  → upload to storage bucket "product-images" (private, 10MiB limit,
    image/jpeg|png|webp only)
    path convention: {organization_id}/{item_id}/{filename}
    (enforced by product_images_insert_staff's storage.foldername checks)
  → product_media row (storage_path, sort_order, is_primary, alt_text)
  → RLS-gated read (NOT a signed URL — see 6.2)
  → public website / Android app
```

`set_primary_product_media()`, `reorder_product_media()`,
`delete_product_media()` are all `OWNER`/`ADMIN`/`STOCK`-gated SECURITY
DEFINER RPCs with org-ownership checks — this part is complete and
consistent with every other admin-mutation RPC in the schema.

### 6.2 One implementation detail to get right, not a design change

The bucket is `public: false`. **The correct client-side call is
`supabase.storage.from('product-images').download(path)` (or an
authenticated fetch against the storage API using the anon key), not
`getPublicUrl()`.** `getPublicUrl()` only produces a working, auth-free URL
when the bucket itself is flagged public — for a private bucket it returns
a URL that will 400/403 without a valid API key attached, even though
`product_images_select_public` already grants `anon` exactly the read
access needed. This isn't a schema problem, it's a "don't reach for the
wrong SDK method" note for whoever writes the storefront's `<img>`
rendering code — worth stating explicitly here so it isn't rediscovered the
hard way during implementation.

### 6.3 Confirmation

**This architecture is ready to use. Do not rebuild it.** The only
remaining work is application code (upload UI, gallery/reorder UI on the
existing item edit page, and the storefront-side image rendering using the
correct download method above) — no migration, table, or RLS change is
needed for this piece.

---

## 6.4 Correction to the brief's framing

The brief asked to confirm a flow through *"signed URL."* Based on what is
actually built, the correct mechanism is an **RLS-gated authenticated/anon
storage read**, not a signed URL — functionally equivalent for this use
case (both keep the bucket private while allowing scoped public read), but
worth flagging the terminology mismatch now rather than have someone build
a signed-URL-issuing endpoint that duplicates protection the RLS policy
already provides.

---

## 7. Shiprocket readiness matrix

**Correction to the brief's framing:** this document cannot separate
"verified" from "corroborated" Shiprocket findings, because **this
repository contains zero evidence that any Shiprocket verification ever
took place** — no code, no credential reference, no env var, no test
artifact, no mention outside this document family and the earlier recovery
report's own "not present" finding (`PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md`
Section B). If verification happened, it happened somewhere this repository
cannot see — treat every row below as **NOT VERIFIED HERE** regardless of
what may have been checked elsewhere, and re-verify before relying on any
of it.

| Item | Status in this repo | What's needed |
|---|---|---|
| Authentication (login → bearer token) | Not verified here | Live call against a real/sandbox Shiprocket account; confirm token refresh/expiry handling |
| Pickup locations | Not verified here | Register at least one pickup location per store that will ship; confirm `store_shipping_config.provider_location_id` mapping works end-to-end |
| Serviceability | Not verified here | Live call for a real pincode; decide caching/rate-limit strategy per Decision D.6 in the roadmap doc |
| Rates | Not verified here | Live call; confirm how/where the rate is shown to the customer before payment |
| Declared value behavior | Not verified here | Confirm what Shiprocket expects here for insurance/COD limits |
| COD fee behavior | Not verified here | Confirm fee calculation and whether it's passed to the customer or absorbed |
| Webhook dashboard configuration | Not verified here | Confirm exact webhook URL registration process in Shiprocket's dashboard |
| Order creation | Not verified here | First real mutation against Shiprocket — must not be done outside a sandbox/test account |
| AWB generation | Not verified here | Depends on order creation being verified first |
| Pickup scheduling | Not verified here | Depends on order creation |
| Tracking | Not verified here | Depends on AWB |
| Webhook authenticity/signature | Not verified here | Confirm Shiprocket's actual current signing mechanism at implementation time — do not assume a scheme from memory |

**Minimum verification required before production shipping integration:**
a sandbox/test Shiprocket account, one successful end-to-end
auth → pickup-location → serviceability → rate → order-creation →
AWB → tracking cycle against test data, and a confirmed webhook signing
mechanism with a working signature check — none of which should be
attempted against real customer orders or real money.

---

## 8. Production deployment architecture

```
                         ┌─────────────────────┐
   kantira.in  ────────► │  Next.js app (SSR)   │
   (DNS + HTTPS)         │  — needs a persistent │
                         │    Node.js process,   │
                         │    not static hosting │
                         └──────────┬───────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             Supabase (prod    Supabase       Shiprocket API
             project, NOT      Storage        (server-only —
             the local dev     (product-      credentials never
             instance)         images bucket) in client code)
                    │
                    ▼
             Payment gateway
             (none for COD-only launch; Razorpay later,
              server-only order creation + webhook)
```

### 8.1 What must be configured before going live — checklist

- **Domain/DNS:** `kantira.in` → hosting provider's IP/CNAME; separate
  subdomain strategy decision if staff app and public site are meant to be
  distinguishable (e.g. `app.kantira.in` for staff, bare domain for
  storefront — consistent with the existing memory note that
  `app.kantira.in` is already the intended staff hostname).
- **HTTPS:** provider-issued cert (Let's Encrypt via host, or a CDN in
  front) — Supabase Auth redirect URLs and cookies require it.
- **Environment variables:** production `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` set to the real
  domain (currently only a `.env.local.example` with placeholder values
  exists); `SUPABASE_SERVICE_ROLE_KEY` only if a genuinely server-only use
  case needs it — none does today.
- **Supabase production project:** a real hosted Supabase project distinct
  from the local `supabase start` instance used for all recovery/dev work
  — migrations 0001–0017 need to be run against it via `supabase db push`
  (or equivalent), not assumed to already be there.
- **Storage:** confirm the `product-images` bucket + its three policies
  (0015) exist on the production project — they are created by migration,
  so `db push` should carry them, but verify post-migration rather than
  assume.
- **Auth redirects:** `supabase/config.toml`'s
  `site_url`/`additional_redirect_urls` currently point at
  `127.0.0.1:3000` (local dev config) — production Supabase project
  settings need the real domain's callback URL for both staff and customer
  sign-up/email-confirmation flows.
- **Database migrations:** run 0001–0017 against the fresh production
  project in order; do not attempt to hand-reproduce the recovered
  0005–0015 objects any other way.
- **Payment credentials:** none needed for COD-only launch (Section 3.3).
- **Shiprocket credentials:** server-only, in environment variables never
  exposed to `NEXT_PUBLIC_*`, following the same posture the `.env.local.
  example` already documents for `SUPABASE_SERVICE_ROLE_KEY`.
- **Webhook endpoints:** any Shiprocket/payment webhook route must live
  under a Route Handler (not a Server Action, since it must be a plain
  public HTTP endpoint), verify signature/shared-secret before touching any
  table, and write through a SECURITY DEFINER RPC rather than a direct
  table write from an unauthenticated context — matching the roadmap doc's
  own D.11.
- **Error logging / monitoring:** nothing exists today (no Sentry or
  equivalent in `package.json`). Needs a decision before launch, not
  necessarily before this document's scope ends.
- **Backups:** production Supabase project's own point-in-time-recovery /
  backup settings need to be turned on explicitly — the `db_backups/`
  directory in this repo is local dev forensics only, not a production
  backup strategy.
- **Security headers / rate limiting:** nothing exists today at the
  Next.js layer; a public storefront (`create_online_order`, catalog
  reads) is a materially larger attack surface than the current
  staff-only app and should get basic rate limiting (at minimum on
  `create_online_order` and any future webhook/payment endpoint) before
  launch.
- **Production build:** `next build` currently has no CI wired up in this
  repo (no `.github/workflows` or equivalent found) — worth having a build
  gate before deploys, not strictly a blocker for a first launch.

### 8.2 Hosting — do not assume MilesWeb

Next.js 14 with the App Router (Server Actions, middleware, SSR) needs a
**persistent Node.js process** — it is not exportable as static files for
this app (server actions and the auth middleware both require server-side
execution per request). Whether MilesWeb's Node.js hosting product
actually supports this — process management, correct Node version, ability
to run `next start` (or a custom server) continuously rather than
short-lived CGI-style execution — is **unverified** and must be confirmed
against MilesWeb's actual current Node.js hosting documentation before
committing to it. If it turns out to be traditional shared/cPanel hosting
without genuine persistent Node process support, the safer default is a
Node-native host (Vercel, Railway, Render, or a VPS you manage directly) —
not because MilesWeb is assumed unsuitable, but because nothing in this
repository or its history establishes that it is suitable, and getting
this wrong after the domain is already pointed there is expensive to
unwind.

---

## 9. Security model

Carried forward, unchanged, from Phases 1–4 and the 0005–0017 hardening
pass — Phase 5 additions follow the same posture, not a new one:

- Every write beyond plain owner-scoped CRUD goes through a SECURITY
  DEFINER RPC that re-derives identity from `auth.uid()`/
  `current_org_id()`/`current_role()`, never trusts a client-supplied
  organization/customer id.
- RLS is the actual authorization boundary; table-level grants are a
  precondition for RLS to be evaluated at all, not a relaxation of it
  (0011/0013/0017 all exist specifically because this distinction was
  gotten wrong once already — the "RLS-correct but grant-incomplete"
  failure class this schema has now hit three times).
- Customer identity and staff identity are structurally incapable of
  cross-contaminating: `requireOrgContext()` fails closed for a customer,
  and every customer-facing policy is scoped through
  `customers.auth_user_id`, never through `profiles`/`current_org_id()`.
- New surface introduced by this phase that needs the *same* scrutiny the
  existing hardening migrations (0005/0006/0016/0017) already applied to
  everything else, once real code is written against it:
  `create_online_order`'s trusted-server-side repricing (already correct —
  re-reads `items.selling_price` server-side, never trusts a client price),
  and the future webhook endpoints (not yet written — must be
  signature-verified before they exist at all, per Section 8.1).

---

## 10. Database / RLS implications

No schema change is proposed by this document. The one schema change
identified as necessary (Section 2.4, new-customer self-registration) is
described but deliberately **not implemented here**, per this task's
explicit instructions. When it is built, it should be a single additive
migration (0018), following the exact pattern 0005–0017 already
established: new SECURITY DEFINER RPC, minimal column change
(`created_by` nullable or a new marker column), no change to any existing
policy or function signature.

---

## 11. Exact Phase 5 implementation sequence

Building on what already exists rather than the roadmap doc's original
from-scratch sequence (Section E of that document is now superseded by
what 0005–0017 already built):

1. **0018 — customer self-registration** (Section 2.4 decision, once made).
2. **`middleware.ts` public-route allowlist** — add storefront routes
   (`/shop`, `/product/[id]`, `/cart`, `/checkout`, and their prefixes) to
   the unauthenticated-access exception list; add customer-specific
   `/account/*` routes with their own auth check (a customer session, not
   a staff one).
3. **Designate the production public storefront org** — an OWNER action
   (`UPDATE organizations SET is_public_storefront = true WHERE id = ...`),
   done deliberately once the production org exists, not automated.
4. **Storefront application code**: catalog browse, product detail +
   images (Section 6), client-only cart, checkout calling
   `create_online_order()`, customer account pages reading the existing
   self-access views.
5. **Staff fulfillment UI**: an "online orders" view using the existing
   `online_orders_select_staff` policy, wired to
   `advance_online_order_status()`/`assign_online_order_store()` — no new
   RPC needed.
6. **COD launch** — no payment gateway code needed; `payment_status`
   simply reflects staff-recorded COD collection at delivery.
7. **Android customer app** — same backend, same RLS, same RPCs; no server
   changes required to support it once 4–6 exist for the website.
8. **Shiprocket integration** (Section 7) — only after real sandbox
   verification, and only after Section 4.3's serviceability-aware
   allocation filter is added.
9. **Razorpay** (Section 3.4) — only after COD has run in production and
   proven the order/fulfillment pipeline end-to-end.

---

## 12. Risks

- **Silent stalled orders**: an order with no eligible fulfillment store
  today just sits with `fulfillment_store_id = null` and no staff-facing
  surfacing mechanism — needs a dashboard view before launch, not after.
- **Registration gap** (Section 2.4) discovered late in a launch cycle
  could block real customer acquisition on day one if not decided now.
- **Hosting mismatch**: committing to MilesWeb before confirming genuine
  persistent-Node.js support could force a mid-launch platform migration.
- **Unverified Shiprocket contract**: building against assumed API/webhook
  behavior without sandbox verification risks silent shipment failures or
  an insecure webhook receiver.
- **No rate limiting on a now-public write path**
  (`create_online_order`, future signup) — previously every write path in
  this app was behind staff auth; that assumption no longer holds once
  `anon`/customer traffic exists.
- **`available_to_sell`'s missing `security_invoker`** (0016 already fixed
  this — mentioned here only as a reminder that the same review discipline
  needs to be applied to every new view/RPC written for storefront features
  going forward, not as an open item).

---

## 13. Explicit items requiring your approval

1. **Customer self-registration model** (Section 2.4) — Option A (allow
   brand-new signups to create a customer row) vs. Option B (staff/in-store
   history required first).
2. **Payment launch model** (Section 3.3) — confirm COD-only, or override
   with B/C and accept the added pre-launch verification burden.
3. **Which organization is the production public storefront** — a real
   OWNER action against the real production data, not something this
   document or any migration can decide.
4. **Shiprocket integration timing** — confirm no live Shiprocket
   integration work begins before a sandbox verification pass (Section 7)
   is actually done.
5. **Hosting provider** — confirm MilesWeb's Node.js hosting is verified
   compatible with a persistent Next.js SSR process before pointing
   `kantira.in` at it, or choose a Node-native host instead.
6. **Multi-store split fulfillment / partial fulfillment** (Section 4.2,
   points 9–10) — confirm out of scope for v1, as recommended.

---

## 14. Items already approved by existing architecture

These are already built, already reviewed (per the recovery session's own
empirical testing), and need no further sign-off to build application code
against:

- Customer identity linkage model (`customers.auth_user_id` +
  `claim_customer_identity()`), including its complete isolation from
  staff auth.
- Public catalog read RLS/grant model
  (`is_org_public_storefront()` + the associated policies and column
  revokes).
- Product media storage architecture (Section 6), including the
  private-bucket-with-RLS approach in place of a signed-URL scheme.
- The fulfillment-store auto-allocation algorithm (Section 4), for
  single-store-per-order fulfillment.
- The `online_orders`/`online_order_lines`/`stock_reservations`/
  `payment_intents`/`payment_events` schema shape itself, independent of
  which payment model is chosen.

---

## 15. Recommended first implementation phase

**Phase 5.1 — storefront read-only + registration fix**, in this order:
(1) resolve Decision 13.1 and write migration 0018; (2) designate the
production storefront org; (3) open the `middleware.ts` public-route
allowlist; (4) build catalog browse + product detail + images, no cart or
checkout yet. This validates the entire public-read path (RLS, grants,
image serving, the registration fix) against real production data with
zero financial or fulfillment risk, before touching checkout, payment, or
Shiprocket at all.

---

## FINAL GATE

**AMBER** — the data-layer foundation for Phase 5 is substantially built
and, where tested, has held up under real scrutiny, but implementation
should not proceed until the six items in Section 13 are explicitly
decided. None of them require new architecture to resolve — they are
choices, not open engineering problems.
