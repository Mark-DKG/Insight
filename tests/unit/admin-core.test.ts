// Unit tests for platform-admin security primitives. Run:
//   npx esbuild tests/unit/admin-core.test.ts --bundle --platform=node --outfile=/tmp/t.js && node /tmp/t.js
import assert from "node:assert/strict";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp, otpauthUri } from "../../lib/admin/totp";
import { decryptSecret, encryptSecret } from "../../lib/admin/crypto";
import { effectivePermissions, hasPermission, PLATFORM_PERMISSIONS } from "../../lib/admin/permissions";

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.log("  FAIL " + name + "\n       " + (e as Error).message); process.exitCode = 1; }
};

console.log("TOTP (RFC 6238 appendix B vectors, SHA-1, secret '12345678901234567890')");
const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
for (const [seconds, eight] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]] as const) {
  test(`T=${seconds} -> ${eight.slice(2)}`, () => assert.equal(totpCode(rfcSecret, seconds * 1000), eight.slice(2)));
}
test("8-digit variant matches RFC exactly", () => assert.equal(totpCode(rfcSecret, 59_000, 30, 8), "94287082"));
test("base32 round-trips", () => { const b = Buffer.from([0, 1, 2, 250, 255, 128]); assert.deepEqual(base32Decode(base32Encode(b)), b); });
test("generated secret is 32 base32 chars (160 bits)", () => assert.match(generateTotpSecret(), /^[A-Z2-7]{32}$/));
test("verify accepts current code", () => { const s = generateTotpSecret(); const now = Date.now(); assert.equal(verifyTotp(s, totpCode(s, now), now), true); });
test("verify accepts ±1 step drift", () => { const s = generateTotpSecret(); const now = Date.now(); assert.equal(verifyTotp(s, totpCode(s, now - 30_000), now), true); assert.equal(verifyTotp(s, totpCode(s, now + 30_000), now), true); });
test("verify rejects ±2 steps", () => { const s = generateTotpSecret(); const now = 1_700_000_000_000; assert.equal(verifyTotp(s, totpCode(s, now - 90_000), now), false); });
test("verify rejects wrong / malformed codes", () => { const s = generateTotpSecret(); assert.equal(verifyTotp(s, "000000x"), false); assert.equal(verifyTotp(s, ""), false); assert.equal(verifyTotp(s, "12345"), false); });
test("otpauth URI is well-formed", () => assert.match(otpauthUri("ABCD", "a@b.com"), /^otpauth:\/\/totp\/Insight%20by%209DEVs%3Aa%40b\.com\?secret=ABCD&issuer=Insight%20by%209DEVs/));

console.log("Secret encryption (AES-256-GCM)");
process.env.PLATFORM_ADMIN_SECRET = "x".repeat(48);
test("encrypt/decrypt round-trips", () => assert.equal(decryptSecret(encryptSecret("JBSWY3DPEHPK3PXP")), "JBSWY3DPEHPK3PXP"));
test("ciphertext differs each time (random IV)", () => assert.notEqual(encryptSecret("same"), encryptSecret("same")));
test("tampered ciphertext is rejected", () => { const c = encryptSecret("secret").split("."); c[3] = Buffer.from("evil").toString("base64"); assert.throws(() => decryptSecret(c.join("."))); });
test("wrong key is rejected", () => { const c = encryptSecret("secret"); process.env.PLATFORM_ADMIN_SECRET = "y".repeat(48); assert.throws(() => decryptSecret(c)); process.env.PLATFORM_ADMIN_SECRET = "x".repeat(48); });
test("short or missing key refuses to run", () => { const k = process.env.PLATFORM_ADMIN_SECRET; process.env.PLATFORM_ADMIN_SECRET = "short"; assert.throws(() => encryptSecret("a")); process.env.PLATFORM_ADMIN_SECRET = k; });

console.log("Permissions");
test("Super Admin has every permission", () => assert.deepEqual([...effectivePermissions("SUPER_ADMIN")].sort(), [...PLATFORM_PERMISSIONS].sort()));
test("Analyst is read-only", () => { for (const p of ["businesses.manage", "users.manage", "inventory.manage", "settings.manage", "administrators.manage"] as const) assert.equal(hasPermission("ANALYST", [], p), false); });
test("Support Admin has no workspace access by default", () => assert.equal(hasPermission("SUPPORT_ADMIN", [], "workspace.access"), false));
test("Support Admin gets workspace access only when granted", () => assert.equal(hasPermission("SUPPORT_ADMIN", ["workspace.access"], "workspace.access"), true));
test("administrators.manage can never be granted to a non-Super Admin", () => assert.equal(hasPermission("PLATFORM_ADMIN", ["administrators.manage"], "administrators.manage"), false));
test("unknown permission strings are ignored", () => assert.equal(effectivePermissions("ANALYST", ["root", "*"]).includes("root" as never), false));
test("Technical Admin can monitor but not manage businesses", () => { assert.equal(hasPermission("TECHNICAL_ADMIN", [], "system.monitor"), true); assert.equal(hasPermission("TECHNICAL_ADMIN", [], "businesses.manage"), false); });

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
