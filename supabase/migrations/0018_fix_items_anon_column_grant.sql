-- KANTIRA Business OS — Security remediation: anon column exposure on items
--
-- FINDING (from the post-0017 reproducibility sweep comparing a fresh
-- 0001-0017 rebuild against the authoritative database — see
-- db_backups/f_auth_tgrants.txt vs f_disp_tgrants.txt): every one of 48
-- compared tables/views produced an identical anon/authenticated grant set
-- except public.items, where the fresh rebuild shows `anon` holding
-- table-level SELECT while the authoritative database does not.
--
-- ROOT CAUSE: 0011 issues `grant select on public.items to anon;` (a
-- table-level grant covering every column) and then re-asserts 0010's
-- `revoke select (cost_price, created_by) on public.items from anon;`,
-- believing the revoke narrows the grant. PostgreSQL's privilege model does
-- not support this: table-level and column-level ACLs are independent
-- allow-lists with no "deny" concept. Once a role holds table-level SELECT,
-- every column is reachable through it regardless of any column-scoped
-- REVOKE — that REVOKE can only remove a column-level grant that exists
-- separately, and none does here. The authoritative database never hit this
-- because it was built with column-level-only grants to anon (confirmed
-- via db_backups/auth_column_acls.txt — 16 named columns, applied outside
-- migration tracking, the same "grants applied outside supabase migration"
-- pattern 0011/0013/0017 already document elsewhere in this schema).
--
-- IMPACT: on any database built by replaying 0001-0017 (e.g. a fresh
-- production project via `supabase db push`), an anonymous caller can
-- select items.cost_price (internal wholesale cost) and items.created_by
-- (an internal staff UUID) for any publicly-listed item — a real
-- confidentiality leak of internal-only data to unauthenticated public
-- API callers. RLS row-scoping (items_select_public) is untouched and
-- unaffected; this is purely a column-level exposure within already-
-- permitted rows, not a tenant-boundary or row-visibility issue.
--
-- FIX: revoke the erroneous table-level grant and replace it with the
-- authoritative database's own column-level-only grant, reproduced exactly
-- (same 16 columns, verified against auth_column_acls.txt — not invented,
-- not guessed). cost_price and created_by are excluded, matching the
-- authoritative state.
--
-- Migrations 0010 and 0011 are NOT modified — they are already part of the
-- recovered/applied migration history. This is a corrective migration on
-- top of them, matching the pattern every other correction in this schema
-- (0005, 0006, 0016, 0017) already uses. Nothing else changes: no RLS
-- policy, table, function, or other role's grant is touched.

revoke select on public.items from anon;

grant select (
  id,
  organization_id,
  category_id,
  uom_id,
  sku,
  barcode,
  name,
  description,
  hsn_code,
  selling_price,
  tax_rate_percent,
  reorder_level,
  track_inventory,
  is_active,
  created_at,
  updated_at
) on public.items to anon;
