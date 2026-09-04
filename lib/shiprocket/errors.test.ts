import test from "node:test";
import assert from "node:assert/strict";
import { ShiprocketError, redactForLog, toSafeClientMessage } from "./errors";

test("redactForLog strips token/password/email at any nesting depth", () => {
  const input = {
    token: "secret-token",
    nested: { password: "secret-password", authorization: "Bearer secret-token" },
    list: [{ email: "someone@example.com", safe: "keep-me" }],
    safeTopLevel: "keep-me-too",
  };

  const redacted = redactForLog(input) as any;

  assert.equal(redacted.token, "[REDACTED]");
  assert.equal(redacted.nested.password, "[REDACTED]");
  assert.equal(redacted.nested.authorization, "[REDACTED]");
  assert.equal(redacted.list[0].email, "[REDACTED]");
  assert.equal(redacted.list[0].safe, "keep-me");
  assert.equal(redacted.safeTopLevel, "keep-me-too");
});

test("toSafeClientMessage never surfaces Shiprocket's raw text for backend-failure kinds", () => {
  const apiErr = new ShiprocketError("api_error", "Shiprocket returned an error response.", {
    httpStatus: 500,
  });
  const msg = toSafeClientMessage(apiErr);
  assert.equal(msg, "Unable to calculate shipping right now. Please try again.");
});

test("toSafeClientMessage passes through KANTIRA's own validation message for invalid_input", () => {
  const err = new ShiprocketError("invalid_input", "Invalid delivery pincode.");
  assert.equal(toSafeClientMessage(err), "Invalid delivery pincode.");
});
