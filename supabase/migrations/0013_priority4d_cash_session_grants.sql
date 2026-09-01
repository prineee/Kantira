-- KANTIRA Business OS — Priority 4D: cash-session table grants
-- Same bug class as 0011/0010, discovered by the same live smoke testing,
-- now on the `authenticated` role rather than `anon`: RLS policies alone
-- are not sufficient. `pos_terminals` and `cash_sessions` are brand-new
-- base tables (created in 0008) and — empirically confirmed against this
-- local database — do NOT automatically inherit the same default
-- table-level grants that 0001-0007's original base tables have for
-- `authenticated` (every existing `grant ... to authenticated` statement
-- in 0001-0007 is for a VIEW — stock_balances, inventory_valuation,
-- sale_line_cogs, sale_profitability, loyalty_balances — never a base
-- table; base tables evidently relied on a default-privilege mechanism
-- set up once outside any Kantira migration, which does not extend to
-- tables created later via `supabase migration up`). Concretely: querying
-- cash_sessions as `authenticated` failed with 42501 "permission denied
-- for table cash_sessions" even with a fully correct, matching RLS policy
-- in place — the same class of failure as items/anon in 0010, just a
-- different role.
--
-- Purely additive: no RLS, table, or column change. Grants are scoped to
-- exactly what each table's existing RLS policies already allow — no new
-- capability, just making the already-authorized capability reachable.
-- No DELETE grant on either table (no DELETE policy exists on either —
-- a session is a permanent audit record, a terminal deactivates via
-- is_active). No UPDATE grant on cash_sessions: the only path that
-- updates it is close_cash_session(), a SECURITY DEFINER function owned
-- by the table owner, which does not need `authenticated` to hold UPDATE
-- itself (same mechanism post_sale() already relies on for `sales`).
--
-- This is also a note for future migrations: any migration introducing a
-- brand-new base table going forward should include its own explicit
-- `grant select/insert/update ... to authenticated` (and `to anon` only if
-- genuinely public) rather than assuming it will be inherited, since this
-- environment demonstrates that assumption does not hold.

grant select, insert on public.cash_sessions to authenticated;

grant select, insert, update on public.pos_terminals to authenticated
;
