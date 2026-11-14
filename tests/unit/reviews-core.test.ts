// npx esbuild tests/unit/reviews-core.test.ts --bundle --platform=node --outfile=/tmp/r.js && node /tmp/r.js
import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, dedupeKey, displayNameFor, parseRating, summarise, MAX_COMMENT } from "../../lib/store/reviews-core";

test("rating must be an integer 1 to 5", () => {
  for (const ok of [1, 2, 3, 4, 5, "4"]) assert.ok(parseRating(ok));
  for (const bad of [0, 6, -1, 3.5, "", "abc", null, undefined, NaN, [], {}, true]) assert.equal(parseRating(bad), null);
});
test("display name shows first name and last initial only", () => {
  assert.equal(displayNameFor("Ama Kofi Mensah"), "Ama M.");
  assert.equal(displayNameFor("  ama   boateng "), "ama B.");
  assert.equal(displayNameFor("Ama"), "Ama");
  assert.equal(displayNameFor("   "), "Shopper");
  assert.ok(!displayNameFor("Ama Kofi Mensah").includes("Kofi"));
});
test("dedupe keys separate products from stores and shoppers", () => {
  assert.equal(dedupeKey("PRODUCT", "s1", "l1"), "P:s1:l1");
  assert.equal(dedupeKey("STORE", "s1", "b1"), "S:s1:b1");
  assert.notEqual(dedupeKey("PRODUCT", "s1", "x"), dedupeKey("STORE", "s1", "x"));
});
test("comment cleaning: optional, trimmed, no links, bounded", () => {
  assert.deepEqual(cleanText(undefined, 100), { value: null });
  assert.deepEqual(cleanText("   ", 100), { value: null });
  assert.equal(cleanText("  Great service  ", 100).value, "Great service");
  assert.ok(cleanText("ok", 100).error);
  assert.ok(cleanText("visit http://spam.example now", 100).error);
  assert.ok(cleanText("see www.spam.xyz", 100).error);
  assert.ok(cleanText("buy at shop.com today", 100).error);
  assert.ok(cleanText("x".repeat(MAX_COMMENT + 1), MAX_COMMENT).error);
  assert.ok(cleanText(42 as unknown, 100).error);
  assert.equal(cleanText("a\u0000b c nice", 100).value, "abc nice");
  assert.equal(cleanText("one\n\n\n\n\ntwo here", 100).value, "one\n\ntwo here");
});
test("summary averages to one decimal and counts the distribution", () => {
  const s = summarise([5, 5, 4, 1]);
  assert.equal(s.count, 4); assert.equal(s.average, 3.8);
  assert.deepEqual(s.distribution, { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
  assert.deepEqual(summarise([]), { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  assert.equal(summarise([9, 0, 3]).count, 1);
});
