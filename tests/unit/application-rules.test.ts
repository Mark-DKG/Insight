// npx esbuild tests/unit/application-rules.test.ts --bundle --platform=node --outfile=/tmp/a.js && node /tmp/a.js
import assert from "node:assert/strict";
import { applicationProblems, phoneProblem, validEmail, conditionalDocuments, missingDocuments, isGhana, REQUIRED_FIELDS } from "../../lib/store/application-rules";

let passed = 0;
const test = (n: string, f: () => void) => { f(); passed++; console.log("  ok  " + n); };

const good = {
  registeredName: "Ama Traders Ltd", tradingName: "Ama Shop", businessType: "Partnership", description: "We sell things.",
  address: "12 High St", country: "Ghana", region: "Ashanti", city: "Kumasi", phone: "0241234567", email: "ama@example.com",
  repName: "Ama Mensah", repPosition: "Owner", repPhone: "0501234567", repEmail: "ama@example.com",
  categories: ["Fashion"], productCount: "1–20", onlinePresence: "instagram.com/ama", fulfilment: "Delivery by rider",
};

test("a complete application has no problems", () => assert.deepEqual(applicationProblems(good), {}));
test("registration number is optional", () => assert.deepEqual(applicationProblems({ ...good, registrationNumber: "" }), {}));
test("every other box is compulsory", () => {
  for (const k of REQUIRED_FIELDS) {
    const p = applicationProblems({ ...good, [k]: k === "categories" ? [] : "" });
    assert.ok(p[k], `${k} should be required`);
  }
});
test("whitespace-only counts as empty", () => assert.ok(applicationProblems({ ...good, city: "   " }).city));
test("drafts may be incomplete", () => assert.deepEqual(applicationProblems({ city: "" }, { forSubmit: false }), {}));

test("email syntax", () => {
  for (const ok of ["a@b.co", "first.last+tag@sub.example.com", "x_y@ex-ample.org"]) assert.ok(validEmail(ok), ok);
  for (const bad of ["plain", "a@b", "a@@b.com", "a b@c.com", "a@b..com", "@b.com", "a@.com", "a@b.c", "a@-b.com"]) assert.ok(!validEmail(bad), bad);
  assert.ok(applicationProblems({ ...good, email: "nope" }).email);
  assert.ok(applicationProblems({ ...good, repEmail: "a@b" }).repEmail);
});

test("Ghana phone: digits only, at most 10", () => {
  assert.equal(phoneProblem("Ghana", "0241234567"), null);
  assert.equal(phoneProblem("ghana", "241234567"), null);
  assert.ok(phoneProblem("Ghana", "02412345678"));      // 11 digits
  assert.ok(phoneProblem("Ghana", "+233241234567"));    // not digits only
  assert.ok(phoneProblem("Ghana", "024 123 4567"));     // spaces
  assert.ok(phoneProblem("Ghana", "12345"));            // too short
  assert.ok(applicationProblems({ ...good, phone: "02412345678" }).phone);
  assert.ok(applicationProblems({ ...good, repPhone: "abc" }).repPhone);
});
test("other countries use international numbers", () => {
  assert.equal(phoneProblem("Nigeria", "+234 803 123 4567"), null);
  assert.equal(phoneProblem("United Kingdom", "02012345678"), null);   // 11 digits fine outside Ghana
  assert.ok(phoneProblem("Nigeria", "12"));
  assert.ok(phoneProblem("Nigeria", "call me"));
});
test("Ghana detection", () => { assert.ok(isGhana(" Ghana ")); assert.ok(!isGhana("Nigeria")); assert.ok(!isGhana(null)); });

test("physical shop needs a shop address", () => {
  assert.ok(applicationProblems({ ...good, physicalPresence: true }).shopAddress);
  assert.deepEqual(applicationProblems({ ...good, physicalPresence: true, shopAddress: "Stall 4, Kejetia Market" }), {});
  assert.equal(applicationProblems({ ...good, physicalPresence: false }).shopAddress, undefined);
});
test("every application needs a Ghana Card or Voter's ID photo, shop or not", () => {
  for (const data of [{ physicalPresence: false }, { physicalPresence: true }, {}]) {
    const docs = conditionalDocuments(data);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].required, true);
    assert.match(docs[0].label, /Ghana Card or Voter's ID/);
    assert.deepEqual(missingDocuments(data, [], []), [docs[0].label]);
    assert.deepEqual(missingDocuments(data, [], ["owner_id"]), []);
  }
});
test("a configured owner_id document is not listed twice", () => {
  const cfg = [{ key: "owner_id", label: "ID", required: true }];
  assert.deepEqual(missingDocuments({}, cfg, []), ["Photo of your Ghana Card or Voter's ID"]);
});
test("configured required documents still apply", () => {
  const cfg = [{ key: "reg_cert", label: "Registration certificate", required: true }, { key: "tax", label: "Tax ID", required: false }];
  assert.deepEqual(missingDocuments({}, cfg, []), ["Registration certificate", "Photo of your Ghana Card or Voter's ID"]);
  assert.deepEqual(missingDocuments({}, cfg, ["reg_cert"]), ["Photo of your Ghana Card or Voter's ID"]);
});

console.log(`\n${passed} passed`);
