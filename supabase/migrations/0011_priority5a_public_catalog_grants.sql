-- KANTIRA Business OS — Priority 5A: public catalog table-level grants
-- Fixes an incompleteness in 0010, found during live smoke testing: RLS
-- policies alone are not sufficient for the `anon` Postgres role. Supabase's
-- local template grants table-level SELECT/INSERT/UPDATE/DELETE to
-- `authenticated` on every table by default (via ALTER DEFAULT PRIVILEGES
-- set up by Supabase's own bootstrap, not by any Kantira migration — 0001
-- only ever grants function EXECUTE, never table DML), but deliberately
-- does NOT do this for `anon` — the API stays closed to anonymous callers
-- until a table is explicitly granted. 0010 added the anon-facing RLS
-- policies (items_select_public, product_categories_select_public,
-- units_of_measurement_select_public) but never added the matching
-- table-level GRANT, so anon requests were failing with a Postgres 42501
-- "permission denied" error *before* RLS was ever evaluated — a strictly
-- stricter failure than intended (nothing was exposed; the catalog was
-- simply completely broken for anon, RLS-safe but non-functional).
--
-- Purely additive: 0001-0010 are not modified. No RLS policy changes, no
-- table/column changes. Table-level GRANT SELECT does not bypass RLS —
-- items_select_public still restricts every anon row read to
-- is_active=true rows in the designated public-storefront org.

grant select on public.items to anon;

grant select on public.product_categories to anon;

grant select on public.units_of_measurement to anon;

-- Re-assert column-level exclusions now that the table grant above would
-- otherwise include them (0010's revoke was a no-op with no table grant to
-- narrow — see 0010's own comment).
revoke select (cost_price, created_by) on public.items from anon
;
