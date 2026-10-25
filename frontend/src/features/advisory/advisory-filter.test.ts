import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSlot, matchesAvailability, nextAvailableSlot, riyadhInstant } from "./advisory-availability.ts";
import { filterAdvisors, filterOptions, normalize, searchScore, sortAdvisors } from "./advisory-filter.ts";
import { DEMO_ADVISORS } from "./demo-advisors.ts";
import { EMPTY_ADVISOR_FILTERS } from "./advisory-types.ts";

const all = DEMO_ADVISORS;
const ids = (xs: { id: string }[]) => xs.map((a) => a.id);
// Sunday 4 Jan 2026, 08:00 Riyadh time (= 05:00 UTC). Every advisor's rules are weekly, so the week is easy to reason about.
const SUNDAY_8AM = riyadhInstant(2026, 1, 4, "08:00");

test("the demo seed is six fictional, clearly labelled, unverified advisors with no ratings or credentials", () => {
  assert.equal(all.length, 6);
  assert.ok(all.every((a) => a.isDemo && !a.affiliationVerified));
  assert.ok(all.every((a) => !("rating" in a) && !("reviews" in a) && !("publications" in a)));
  assert.equal(new Set(all.map((a) => a.id)).size, 6);
});

test("normalize ignores case, punctuation and diacritics", () => {
  assert.equal(normalize("  Al‑Qahtani, Dr.  "), "al qahtani dr");
  assert.equal(normalize("Café"), "cafe");
});

test("search finds an advisor by name, institution, specialization and expertise", () => {
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "omar" }, SUNDAY_8AM)), ["omar-al-harbi"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "kaust" }, SUNDAY_8AM)), ["faisal-al-nasser"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "regulatory" }, SUNDAY_8AM)), ["lina-al-rashid"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "genomics" }, SUNDAY_8AM)), ["sara-al-qahtani"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "king faisal specialist" }, SUNDAY_8AM)), ["khalid-al-mutairi"]);
});

test("every word of a search must match, and a miss returns nothing", () => {
  assert.equal(searchScore(all[0]!, "nanomedicine omar"), 3 + 5);
  assert.equal(searchScore(all[0]!, "nanomedicine genomics"), 0);
  assert.equal(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "zzz" }, SUNDAY_8AM).length, 0);
  assert.equal(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "   " }, SUNDAY_8AM).length, 6);
});

test("specialization, institution and consultation type filters narrow the list", () => {
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, specialization: "Medical AI" }, SUNDAY_8AM)), ["faisal-al-nasser"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, institution: "King Saud University" }, SUNDAY_8AM)), ["sara-al-qahtani"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, consultationType: "advisory" }, SUNDAY_8AM)), ["omar-al-harbi", "faisal-al-nasser", "reem-al-salem", "lina-al-rashid"]);
  assert.deepEqual(ids(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, consultationType: "review" }, SUNDAY_8AM)), ["omar-al-harbi", "sara-al-qahtani", "reem-al-salem", "khalid-al-mutairi"]);
});

test("all the filters work together", () => {
  const f = { ...EMPTY_ADVISOR_FILTERS, consultationType: "advisory" as const, query: "regulatory", institution: "Imam Abdulrahman Bin Faisal University" };
  assert.deepEqual(ids(filterAdvisors(all, f, SUNDAY_8AM)), ["lina-al-rashid"]);
  assert.equal(filterAdvisors(all, { ...f, specialization: "Medical AI" }, SUNDAY_8AM).length, 0);
});

test("the next available slot honours the weekly rules and the two-hour minimum notice", () => {
  const omar = nextAvailableSlot(all[0]!, SUNDAY_8AM)!;
  assert.equal(omar.daysFromToday, 0);
  assert.equal(omar.time, "10:00"); // 09:00 is less than two hours away
  const reem = nextAvailableSlot(all.find((a) => a.id === "reem-al-salem")!, SUNDAY_8AM)!; // Tuesday and Wednesday only
  assert.equal(reem.date, "2026-01-06");
  assert.equal(reem.daysFromToday, 2);
  const lateSunday = riyadhInstant(2026, 1, 4, "23:00");
  assert.equal(nextAvailableSlot(all[0]!, lateSunday)!.date, "2026-01-05"); // Omar also opens Mondays
});

test("availability filters: today, within a week, within two weeks", () => {
  const today = filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, availability: "today" }, SUNDAY_8AM);
  assert.deepEqual(ids(today), ["omar-al-harbi", "faisal-al-nasser", "khalid-al-mutairi"]);
  assert.equal(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, availability: "week" }, SUNDAY_8AM).length, 6);
  assert.equal(matchesAvailability({ availability: [] }, "twoWeeks", SUNDAY_8AM), false);
  assert.equal(matchesAvailability({ availability: [] }, "any", SUNDAY_8AM), true);
});

test("sorting: experience puts the most experienced first; relevance ranks the best match first and is stable otherwise", () => {
  assert.deepEqual(ids(sortAdvisors(all, "experience", "")), ["khalid-al-mutairi", "omar-al-harbi", "reem-al-salem", "sara-al-qahtani", "lina-al-rashid", "faisal-al-nasser"]);
  assert.deepEqual(ids(sortAdvisors(all, "relevance", "")), ids(all));
  const ranked = sortAdvisors(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, query: "faisal" }, SUNDAY_8AM), "relevance", "faisal");
  assert.equal(ranked[0]!.id, "faisal-al-nasser"); // name match outranks the "King Faisal Specialist" institution match
  assert.equal(ranked[1]!.id, "khalid-al-mutairi");
});

test("dropdown options come from the data", () => {
  const o = filterOptions(all);
  assert.equal(o.specializations.length, 6);
  assert.equal(o.institutions.length, 6);
});

test("a slot is shown in Riyadh time", () => {
  const slot = nextAvailableSlot(all[0]!, SUNDAY_8AM)!;
  assert.equal(formatSlot(slot), "Sun 4 Jan · 10:00 AM");
  assert.equal(formatSlot({ ...slot, time: "15:30" }), "Sun 4 Jan · 03:30 PM");
});
