import test from "node:test";
import assert from "node:assert/strict";
import manifest from "./manifest";

test("the web app manifest describes the public catalogue and storefront", () => {
  const m = manifest();
  assert.equal(m.name, "KANTIRA");
  assert.equal(m.short_name, "KANTIRA");
  assert.match(m.description ?? "", /hospital apparel catalogue and online storefront/i);
  assert.doesNotMatch(m.description ?? "", /internal/i);
});

test("the installed app opens at the root URL, which role-routes staff to /dashboard", () => {
  assert.equal(manifest().start_url, "/");
});
