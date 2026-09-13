import test from "node:test";
import assert from "node:assert/strict";
import { isApiRoute, isPublicStorefrontPath } from "./public-routes";

test("storefront root and section routes are public", () => {
  for (const path of [
    "/",
    "/shop",
    "/shop/",
    "/shop/anything",
    "/categories",
    "/categories/some-id",
    "/search",
    "/products",
    "/products/abc-123",
  ]) {
    assert.equal(isPublicStorefrontPath(path), true, path);
  }
});

test("internal and customer-account routes stay gated", () => {
  for (const path of [
    "/dashboard",
    "/items",
    "/items/1/edit",
    "/stores",
    "/account",
    "/account/orders",
    "/login",
    "/signup",
  ]) {
    assert.equal(isPublicStorefrontPath(path), false, path);
  }
});

test("does not match unrelated paths with a shared prefix", () => {
  assert.equal(isPublicStorefrontPath("/shopping-list"), false);
  assert.equal(isPublicStorefrontPath("/searchindex"), false);
});

test("isApiRoute matches every app/api path, including the Razorpay webhook", () => {
  for (const path of ["/api", "/api/webhooks/razorpay", "/api/anything/nested"]) {
    assert.equal(isApiRoute(path), true, path);
  }
});

test("isApiRoute does not match non-API paths, including one with 'api' in its name", () => {
  for (const path of ["/", "/shop", "/dashboard", "/apiary"]) {
    assert.equal(isApiRoute(path), false, path);
  }
});
