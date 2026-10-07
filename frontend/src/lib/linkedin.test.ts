import { test } from "node:test";
import assert from "node:assert/strict";
import { safeLinkedInUrl } from "./linkedin.ts";

test("a real linkedin.com profile link is returned", () => {
  assert.equal(safeLinkedInUrl("https://www.linkedin.com/in/sara/"), "https://www.linkedin.com/in/sara/");
});

test("nothing is returned when no link was provided, so no icon is shown", () => {
  assert.equal(safeLinkedInUrl(undefined), undefined);
  assert.equal(safeLinkedInUrl(null), undefined);
  assert.equal(safeLinkedInUrl(""), undefined);
});

test("anything that is not a linkedin.com web address is never turned into a link", () => {
  assert.equal(safeLinkedInUrl("javascript:alert(1)"), undefined);
  assert.equal(safeLinkedInUrl("https://evil.com/in/x"), undefined);
  assert.equal(safeLinkedInUrl("https://linkedin.com.evil.com/in/x"), undefined);
  assert.equal(safeLinkedInUrl("not a url"), undefined);
});
