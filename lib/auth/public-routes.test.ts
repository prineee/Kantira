import test from "node:test";
import assert from "node:assert/strict";
import {
  isApiRoute,
  isCustomerAuthPath,
  isCustomerProtectedPath,
  isPublicStorefrontPath,
  isStaffAuthPath,
} from "./public-routes";

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
    "/catalogue",
    "/catalogue/",
  ]) {
    assert.equal(isPublicStorefrontPath(path), true, path);
  }
});

test("the catalogue PDF is public by exact path only", () => {
  assert.equal(
    isPublicStorefrontPath("/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf"),
    true,
  );
  for (const path of [
    "/assets",
    "/assets/catalogue",
    "/assets/catalogue/",
    "/assets/catalogue/other.pdf",
    "/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf/extra",
    "/assets/catalogue/kantira_digital_hospital_apparel_catalogue.pdf",
    "/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf.bak",
    "/assets/private/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf",
  ]) {
    assert.equal(isPublicStorefrontPath(path), false, path);
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
  assert.equal(isPublicStorefrontPath("/catalogues"), false);
  assert.equal(isPublicStorefrontPath("/catalogue-admin"), false);
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

test("isCustomerAuthPath matches only /customer/login and /customer/signup", () => {
  for (const path of [
    "/customer/login",
    "/customer/login/",
    "/customer/signup",
    "/customer/signup/",
  ]) {
    assert.equal(isCustomerAuthPath(path), true, path);
  }
  for (const path of ["/login", "/signup", "/customer", "/customer/orders", "/account"]) {
    assert.equal(isCustomerAuthPath(path), false, path);
  }
});

test("isStaffAuthPath matches the staff /login, /signup, and /auth routes only", () => {
  for (const path of ["/login", "/signup", "/auth/callback"]) {
    assert.equal(isStaffAuthPath(path), true, path);
  }
  for (const path of ["/customer/login", "/customer/signup", "/account", "/dashboard"]) {
    assert.equal(isStaffAuthPath(path), false, path);
  }
});

test("isCustomerProtectedPath matches only the customer-area pages", () => {
  for (const path of ["/account", "/account/orders", "/cart", "/checkout", "/checkout/confirmation"]) {
    assert.equal(isCustomerProtectedPath(path), true, path);
  }
  for (const path of ["/dashboard", "/items", "/stores", "/customer/login", "/shop"]) {
    assert.equal(isCustomerProtectedPath(path), false, path);
  }
});
