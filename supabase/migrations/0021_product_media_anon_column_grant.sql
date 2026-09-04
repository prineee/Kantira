-- KANTIRA Business OS — K-CATALOG-2: product_media anon column exposure fix
--
-- FINDING: migration 0015 grants `anon` table-level SELECT on
-- public.product_media (`GRANT SELECT, ... ON TABLE public.product_media TO
-- anon;`) with no column-level narrowing. That table includes `created_by`
-- (an internal staff profile UUID) — the exact same class of exposure 0018
-- already fixed for public.items' `cost_price`/`created_by`, for the exact
-- same reason: table-level and column-level ACLs are independent allow-
-- lists in PostgreSQL, so a column-scoped REVOKE with no matching table-
-- level grant is a no-op, and a bare table-level GRANT exposes every
-- column regardless of what RLS otherwise restricts at the row level.
--
-- product_media_select_public (0015) already scopes anon to rows whose
-- item is_active and in the public-storefront org — that row-level scoping
-- is correct and untouched here. This migration only narrows which
-- *columns* of an already-visible row anon can read, the same scope as
-- 0018.
--
-- FIX: replace the table-level anon grant with the same column-level-only
-- grant, listing every column except created_by (there is no cost_price on
-- this table). Nothing else changes: no RLS policy, table, function,
-- storage policy, or other role's grant is touched. Migrations 0001-0020
-- are not modified.

revoke select on public.product_media from anon;

grant select (
  id,
  organization_id,
  item_id,
  storage_path,
  media_type,
  sort_order,
  is_primary,
  alt_text,
  created_at,
  updated_at
) on public.product_media to anon;
