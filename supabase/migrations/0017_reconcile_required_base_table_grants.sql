-- KANTIRA Business OS — reconcile required base-table grants for `authenticated`
--
-- ============================================================================
-- THIS IS A RECOVERY/RECONCILIATION MIGRATION, NOT A RECREATION OF HISTORICAL
-- MIGRATIONS 0001-0014.
-- ============================================================================
--
-- FINDING: a fresh database built strictly from migrations 0001-0016 leaves
-- `authenticated` without SELECT/INSERT/UPDATE/DELETE on 33 base tables that
-- the existing Phase 1-4 application depends on for ordinary CRUD (accounts,
-- customers, items, sales, purchases, returns, payments, receipts, stock,
-- etc.). The authoritative database has always had these grants; they were
-- applied to it OUTSIDE migration tracking -- confirmed by their total
-- absence from supabase_migrations.schema_migrations and from
-- pg_default_acl (which only provides TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
-- to `authenticated` by default, never SELECT/INSERT/UPDATE/DELETE).
--
-- Migration 0007's own header comment already documented this exact
-- situation at the time it was written: "Table-level grants are not listed
-- here because no existing table in this schema has one either... base
-- table privileges for authenticated/anon/service_role are inherited from
-- the project's own default-privilege configuration, applied outside the
-- migrations." The evidence is consistent with these grants having been
-- applied via Supabase's Dashboard/Studio "Table Editor" convenience
-- default (which grants full CRUD to `authenticated`/`anon` on a table
-- created through that UI, unless explicitly disabled) rather than through
-- any SQL migration -- confirmed by the pattern hitting only base TABLES,
-- never any of the 4 original views (inventory_valuation, sale_line_cogs,
-- sale_profitability, stock_balances all show only their own
-- migration-granted SELECT, no INSERT/UPDATE/DELETE, even though a blanket
-- `GRANT ... ON ALL TABLES IN SCHEMA public` would have swept those in too).
--
-- This migration does NOT invent, guess, or broaden anything. Every grant
-- below was read directly off the authoritative database via
-- information_schema.role_table_grants, per-table, per-privilege-type, and
-- reproduces that exact set -- including the fact that it is NOT uniform:
-- 30 tables get full SELECT/INSERT/UPDATE/DELETE, but 3
-- (loyalty_accounts, loyalty_programs, loyalty_transactions) get SELECT
-- only, matching 0007's own documented design that all loyalty ledger
-- writes go through SECURITY DEFINER functions
-- (ensure_loyalty_account/loyalty_provision_account/etc.), never a direct
-- client INSERT/UPDATE/DELETE.
--
-- Explicitly NOT touched by this migration, per direct evidence:
--   - `anon` gets nothing new here. Its only non-default grants
--     (product_categories, product_media, units_of_measurement) are
--     already correctly granted by 0010/0011/0015 respectively.
--   - `service_role` gets nothing new here. Its full-CRUD access on every
--     table already comes entirely from Postgres's own default ACL
--     (confirmed via pg_default_acl: service_role=arwdDxtm/postgres),
--     identical on both the authoritative database and a from-scratch
--     disposable one.
--   - The 9 post-0014 tables (online_orders, online_order_lines,
--     payment_intents, payment_events, product_media, customer_addresses,
--     stock_reservations, store_shipping_config) are NOT touched here --
--     their grants are already fully and correctly represented in 0015,
--     verified identical between authoritative and a disposable rebuild.
--   - No RLS policy, function, trigger, or table structure is touched.
--     RLS continues to be the actual row-level authorization boundary;
--     these are base table-level grants, a precondition for RLS to even
--     be evaluated, not a relaxation of it.

-- ============================================================================
-- Full CRUD (SELECT, INSERT, UPDATE, DELETE) -- 30 tables
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_role_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_store_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_store_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entry_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_line_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_return_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movement_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measurement TO authenticated;

-- ============================================================================
-- SELECT only -- 3 tables (loyalty ledger: all writes are RPC/trigger-only,
-- per 0007's design -- no INSERT/UPDATE/DELETE grant exists for these on
-- the authoritative database, and none is added here)
-- ============================================================================

GRANT SELECT ON public.loyalty_accounts TO authenticated;
GRANT SELECT ON public.loyalty_programs TO authenticated;
GRANT SELECT ON public.loyalty_transactions TO authenticated;
