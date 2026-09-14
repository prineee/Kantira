import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as envModule from "./env";
import * as authModule from "./auth";

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

test("no NEXT_PUBLIC_SHIPROCKET variable is ever referenced in source", () => {
  const selfPath = __filename;
  const files = listSourceFiles(PROJECT_ROOT).filter((f) => f !== selfPath);
  const offenders: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (/NEXT_PUBLIC_SHIPROCKET/.test(content)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test(".env.local is gitignored", () => {
  const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, ".gitignore"), "utf8");
  assert.match(gitignore, /^\.env\.local$/m);
});

test("the env/auth modules export no function that returns the raw password or email", () => {
  const forbiddenExportNames = ["getPassword", "getEmail", "getCredentials", "getShiprocketPassword"];
  for (const name of forbiddenExportNames) {
    assert.equal((envModule as any)[name], undefined);
    assert.equal((authModule as any)[name], undefined);
  }
});

test("getShiprocketConfig's return value never got logged by this test file (sanity: no secret var leaks into process.env snapshot)", () => {
  // This is a guard against accidentally widening env.ts's public surface,
  // not a functional assertion — getShiprocketConfig is exercised in
  // env.test.ts. Here we only assert the module's public export list is the
  // expected, minimal set.
  const exportedNames = Object.keys(envModule).sort();
  assert.deepEqual(exportedNames, [
    "_resetShiprocketConfigForTests",
    "getShiprocketConfig",
    "getShiprocketWebhookSecret",
  ]);
});
