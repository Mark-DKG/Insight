// npx esbuild tests/unit/shopper-core.test.ts --bundle --platform=node --outfile=/tmp/sh.js && node /tmp/sh.js
import assert from "node:assert/strict";
import { normalizeEmail, passwordProblem, isLocked, afterFailure, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES } from "../../lib/store/shopper-core";

let passed = 0;
const test = (n: string, f: () => void) => { f(); passed++; console.log("  ok  " + n); };

test("email is trimmed and lower-cased", () => assert.equal(normalizeEmail("  Ama@Example.COM "), "ama@example.com"));
test("short passwords rejected", () => assert.ok(passwordProblem("abc12")));
test("common passwords rejected", () => assert.ok(passwordProblem("password123")));
test("password equal to email rejected", () => assert.ok(passwordProblem("ama@example.com", "ama@example.com")));
test("repeated character rejected", () => assert.ok(passwordProblem("aaaaaaaaaa")));
test("overlong password rejected", () => assert.ok(passwordProblem("x1".repeat(100))));
test("good password accepted", () => assert.equal(passwordProblem("kente-Cloth-84"), null));
test("not locked when no lock", () => assert.equal(isLocked(null), false));
test("locks after max failures", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const r = afterFailure(MAX_FAILED_ATTEMPTS - 1, now);
  assert.ok(r.lockedUntil);
  assert.equal(r.lockedUntil!.getTime() - now.getTime(), LOCKOUT_MINUTES * 60000);
  assert.equal(isLocked(r.lockedUntil, now), true);
  assert.equal(isLocked(r.lockedUntil, new Date(now.getTime() + LOCKOUT_MINUTES * 60000 + 1)), false);
});
test("fewer failures do not lock", () => assert.ok(!afterFailure(1).lockedUntil));
console.log(`\n${passed} passed`);
