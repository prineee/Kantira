-- KANTIRA Business OS — Priority 5A foundation: customer self-service auth
-- linkage
-- Purely additive: 0001-0008 are not modified. No change to any existing
-- table's existing columns, no change to any existing RLS policy, no
-- change to any existing RPC.
--
-- CONTEXT (from the Priority 5A discovery pass): an auth.users row with no
-- matching `profiles` row already fails closed everywhere in the schema
-- today (current_org_id()/current_role() simply return NULL, every
-- existing org-scoped policy evaluates to false) — employee and future
-- customer auth safely coexist in the same Supabase Auth project with no
-- change required for that part. What's actually missing is narrower:
-- `customers` has no column linking a row to the auth.users identity that
-- would eventually log in as that customer, and no RLS policy lets a
-- customer read their own customer/loyalty rows (the existing
-- customers_select / loyalty_accounts_select / loyalty_transactions_select
-- policies are employee-only, gated on current_org_id()).
--
-- SCOPE: read-only self-access. This migration adds the linkage column and
-- lets an authenticated customer SELECT their own customer row and their
-- own loyalty balance/history — nothing else. It does NOT add a
-- self-signup INSERT policy, self-service UPDATE (editing own
-- phone/email/address), or any online-order/cart table — those are
-- separate, later decisions once the actual signup/account-edit flow is
-- designed, not implied by "read your own loyalty points" alone. No
-- existing loyalty ledger behavior changes: EARN/REDEEM/REVERSAL triggers,
-- redemption RPCs, and the employee-facing policies are untouched.

-- ============================================================
-- COLUMN: customers.auth_user_id
-- ============================================================

alter table public.customers
  add column auth_user_id uuid references auth.users (id) on delete set null;

-- A given auth identity maps to at most one customer record per org
-- (mirrors the unique(organization_id, store_code) posture elsewhere);
-- multiple customers may still have a null auth_user_id (walk-in/
-- employee-created records with no online account), and Postgres unique
-- indexes permit unlimited nulls, so this does not constrain today's data.
create unique index customers_organization_id_auth_user_id_key
  on public.customers (organization_id, auth_user_id)
  where auth_user_id is not null;

create index customers_auth_user_id_idx on public.customers (auth_user_id);

-- ============================================================
-- RLS: customer self-access (additive to the existing employee-only
-- policies — Postgres RLS policies for the same command are OR'd, so this
-- adds a second way in rather than replacing the first)
-- ============================================================

create policy customers_select_self on public.customers
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy loyalty_accounts_select_self on public.loyalty_accounts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = loyalty_accounts.customer_id
        and c.auth_user_id = auth.uid()
    )
  );

create policy loyalty_transactions_select_self on public.loyalty_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.loyalty_accounts la
      join public.customers c on c.id = la.customer_id
      where la.id = loyalty_transactions.loyalty_account_id
        and c.auth_user_id = auth.uid()
    )
  )
;
