import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSULTATION_TABS, inTab } from "./consultation-tabs.ts";

const NOW = new Date("2026-10-25T10:00:00Z");
const FUTURE = "2026-10-27T08:00:00Z";
const PAST = "2026-10-20T08:00:00Z";
const b = (status: string, startsAt = FUTURE, rescheduledFromId: string | null = null) => ({ status, startsAt, rescheduledFromId }) as Parameters<typeof inTab>[0];
const tabsOf = (x: ReturnType<typeof b>) => CONSULTATION_TABS.filter((t) => inTab(x, t.id, NOW)).map((t) => t.id);

test("a future pending request is Upcoming and Pending", () => {
  assert.deepEqual(tabsOf(b("PENDING")), ["upcoming", "pending"]);
});

test("a future confirmed booking is Upcoming and Confirmed", () => {
  assert.deepEqual(tabsOf(b("CONFIRMED")), ["upcoming", "confirmed"]);
});

test("a confirmed booking whose time has passed is Confirmed but no longer Upcoming", () => {
  assert.deepEqual(tabsOf(b("CONFIRMED", PAST)), ["confirmed"]);
});

test("completed, and declined/cancelled, each have their own tab", () => {
  assert.deepEqual(tabsOf(b("COMPLETED", PAST)), ["completed"]);
  assert.deepEqual(tabsOf(b("CANCELLED")), ["cancelled"]);
  assert.deepEqual(tabsOf(b("REJECTED")), ["cancelled"]);
  assert.deepEqual(tabsOf(b("EXPIRED")), ["cancelled"]); // an unanswered request that ran out of time
});

test("the original of an accepted reschedule and its replacement both appear under Rescheduled", () => {
  assert.deepEqual(tabsOf(b("RESCHEDULED", PAST)), ["rescheduled"]);
  assert.deepEqual(tabsOf(b("CONFIRMED", FUTURE, "orig-id")), ["upcoming", "confirmed", "rescheduled"]);
});

test("there are exactly six tabs, in the order the page shows them", () => {
  assert.deepEqual(CONSULTATION_TABS.map((t) => t.label), ["Upcoming", "Pending", "Confirmed", "Completed", "Cancelled", "Rescheduled"]);
});
