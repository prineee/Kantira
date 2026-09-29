// Role gates for the Phase 6B-15B storefront publishing layer. These only
// drive UI/Server Action messaging — the database is the authorization
// boundary (migration 0032):
//   - set_storefront_enabled() re-checks OWNER server-side.
//   - items_enforce_publish_authorization (trigger) re-checks OWNER/ADMIN
//     for any change to items.is_published.
// Keep these lists in lockstep with that migration.

// Organization-level configuration is OWNER-only in this schema
// (organizations_update_owner, migration 0001), so the storefront switch
// follows the same model rather than widening it to ADMIN.
export const STOREFRONT_TOGGLE_ROLES = ["OWNER"] as const;

// Publishing is customer-facing catalogue configuration — the same
// OWNER/ADMIN tier as Shiprocket pickup mapping (migration 0030).
export const ITEM_PUBLISH_ROLES = ["OWNER", "ADMIN"] as const;

// Who may open the /storefront settings page (read-only for ADMIN).
export const STOREFRONT_VIEW_ROLES = ["OWNER", "ADMIN"] as const;

function hasRole(allowed: readonly string[], role: string | null | undefined): boolean {
  return typeof role === "string" && allowed.includes(role);
}

export function canToggleStorefront(role: string | null | undefined): boolean {
  return hasRole(STOREFRONT_TOGGLE_ROLES, role);
}

export function canPublishItems(role: string | null | undefined): boolean {
  return hasRole(ITEM_PUBLISH_ROLES, role);
}

export function canViewStorefrontSettings(role: string | null | undefined): boolean {
  return hasRole(STOREFRONT_VIEW_ROLES, role);
}
