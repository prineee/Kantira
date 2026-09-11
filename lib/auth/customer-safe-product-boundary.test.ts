import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Static, repo-wide regression guards for the Phase 3B security correction
// (migration 0022). These catch the two easiest ways this fix could quietly
// regress: someone re-introducing a direct base-table cost_price/created_by
// read in app code, or someone "fixing" a broken read by reaching for a
// service-role client instead of the intended SECURITY DEFINER RPC.
//
// These are NOT a substitute for the real database-backed verification —
// that was done empirically against a disposable local Supabase instance
// (migrations replayed via `supabase db reset`, then `set role
// authenticated` + a signed customer/staff JWT claim, exercised both via
// direct SQL and the live PostgREST Data API) and is recorded in this
// change's PR/session notes, not re-run here. `npm test` has no
// Docker/Postgres dependency today (confirmed: every existing test in this
// repo mocks its Supabase client), and adding one here would break `npm
// test` in any environment without a running local Supabase instance — so
// this file intentionally stays static-analysis-only, matching
// lib/shiprocket/security.test.ts's own established convention for
// something raw TypeScript mocks can't honestly prove (that would be
// exactly the "claiming a security test passed because a mock returned the
// expected result" this correction was asked not to do).

test("no service-role env var is ever read in app/ or lib/ source (no service-role bypass introduced)", () => {
  const files = listSourceFiles(PROJECT_ROOT).filter(
    (f) => f.startsWith(path.join(PROJECT_ROOT, "app")) || f.startsWith(path.join(PROJECT_ROOT, "lib")),
  );
  const offenders: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (/process\.env(\.SUPABASE_SERVICE_ROLE_KEY|\[["']SUPABASE_SERVICE_ROLE_KEY["']\])/.test(content)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("no app code reads items.cost_price or product_media.created_by directly from the base table", () => {
  // The only sanctioned path to cost_price for a staff reader is
  // items_catalog_for_staff() (migration 0022) — never `.from("items")`
  // directly, and never product_media.created_by at all (no code needs
  // it). This is a text-level guard, not a grant/RLS proof; the grant
  // itself already fails closed either way (see migration 0022's own
  // comment), but this catches an accidental base-table reversion in
  // application code before it would ever reach a real database.
  const files = listSourceFiles(path.join(PROJECT_ROOT, "app")).filter(
    (f) => !f.endsWith(".test.ts"),
  );
  const costPriceOffenders: string[] = [];
  const createdByOffenders: string[] = [];
  // Matches an actual `.from("items").select("...cost_price...")` read
  // chain specifically — not `.insert({ cost_price: ... })` /
  // `.update({ cost_price: ... })` (writing a value needs no SELECT
  // privilege on that column, and app/items/actions.ts legitimately does
  // this), and not `.rpc("items_catalog_for_staff").select(...)` (the
  // sanctioned staff-only path, which also matches the base pattern below
  // only by containing the word "items" elsewhere — excluded explicitly).
  const itemsSelectCostPrice =
    /\.from\(\s*["']items["']\s*\)\s*\.?\s*[\s\S]{0,20}?\.select\(\s*[\s\S]{0,400}?cost_price/;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (itemsSelectCostPrice.test(content)) {
      costPriceOffenders.push(file);
    }
    if (/\.from\(\s*["']product_media["']\s*\)\s*\.?\s*[\s\S]{0,20}?\.select\(\s*[\s\S]{0,400}?created_by/.test(content)) {
      createdByOffenders.push(file);
    }
  }
  assert.deepEqual(costPriceOffenders, []);
  assert.deepEqual(createdByOffenders, []);
});
