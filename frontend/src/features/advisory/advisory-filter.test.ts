import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSlot, matchesAvailability, nextAvailableSlot, riyadhInstant } from "./advisory-availability.ts";
import { filterAdvisors, filterOptions, normalize, searchScore, sortAdvisors } from "./advisory-filter.ts";
import { DEMO_ADVISORS } from "./__fixtures__/demo-advisors.ts";
import { EMPTY_ADVISOR_FILTERS, type AdvisorSummary } from "./advisory-types.ts";

// The server now supplies each advisor's `nextAvailable`; these are what it would send at SUNDAY_8AM for the demo advisors' weekly hours.
const SERVER_NEXT: Record<string, [string, string]> = {
  "omar-al-harbi": ["2026-01-04", "10:00"], "sara-al-qahtani": ["2026-01-05", "09:30"], "faisal-al-nasser": ["2026-01-04", "10:00"],
  "reem-al-salem": ["2026-01-06", "09:00"], "khalid-al-mutairi": ["2026-01-04", "13:00"], "lina-al-rashid": ["2026-01-05", "09:00"],
};
const all: AdvisorSummary[] = DEMO_ADVISORS.map((a) => {
  const [day, time] = SERVER_NEXT[a.id]!;
  const [y, m, d] = day!.split("-").map(Number);
  return { ...a, nextAvailable: { startsAt: riyadhInstant(y!, m!, d!, time!).toISOString(), minutes: 30 } };
});
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

test("the card shows the server's next available slot, in Riyadh time", () => {
  const omar = nextAvailableSlot(all[0]!, SUNDAY_8AM)!;
  assert.equal(omar.daysFromToday, 0);
  assert.equal(omar.time, "10:00");
  assert.equal(omar.date, "2026-01-04");
  const reem = nextAvailableSlot(all.find((a) => a.id === "reem-al-salem")!, SUNDAY_8AM)!;
  assert.equal(reem.date, "2026-01-06");
  assert.equal(reem.daysFromToday, 2);
  assert.equal(reem.time, "09:00");
});

test("no next available from the server means none is shown (a fully booked advisor), and the browser never invents one", () => {
  assert.equal(nextAvailableSlot({ nextAvailable: null }, SUNDAY_8AM), null);
  assert.equal(nextAvailableSlot({ nextAvailable: undefined as never }, SUNDAY_8AM), null);
});

test("a slot that has slipped inside the two-hour notice since the page loaded is not promised", () => {
  const soon = { nextAvailable: { startsAt: riyadhInstant(2026, 1, 4, "10:00").toISOString(), minutes: 30 } };
  assert.ok(nextAvailableSlot(soon, SUNDAY_8AM)); // 08:00 now, 10:00 slot: exactly the notice, fine
  assert.equal(nextAvailableSlot(soon, riyadhInstant(2026, 1, 4, "08:01")), null); // one minute later it is inside the notice
});

test("availability filters use the server's value: today, within a week, within two weeks", () => {
  const today = filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, availability: "today" }, SUNDAY_8AM);
  assert.deepEqual(ids(today), ["omar-al-harbi", "faisal-al-nasser", "khalid-al-mutairi"]);
  assert.equal(filterAdvisors(all, { ...EMPTY_ADVISOR_FILTERS, availability: "week" }, SUNDAY_8AM).length, 6);
  assert.equal(matchesAvailability({ nextAvailable: null }, "twoWeeks", SUNDAY_8AM), false);
  assert.equal(matchesAvailability({ nextAvailable: null }, "any", SUNDAY_8AM), true);
});

test("a booked-out advisor drops out of the availability filters (what the old browser-side calculation got wrong)", () => {
  const bookedOut = all.map((a) => (a.id === "omar-al-harbi" ? { ...a, nextAvailable: null } : a));
  assert.deepEqual(ids(filterAdvisors(bookedOut, { ...EMPTY_ADVISOR_FILTERS, availability: "today" }, SUNDAY_8AM)), ["faisal-al-nasser", "khalid-al-mutairi"]);
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
