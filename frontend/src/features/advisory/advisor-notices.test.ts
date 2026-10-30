import assert from "node:assert/strict";
import test from "node:test";
import { ADVISOR_BOOKING_NOT_OPEN_NOTE, DATA_NOTICE_POINTS, DATA_NOTICE_TITLE, PENDING_REVIEW_COPY, SUSPENDED_COPY } from "./advisor-notices.ts";
import { CONTACT_EMAIL } from "./booking-availability.ts";

const all = DATA_NOTICE_POINTS.join(" ");

test("the data notice says who sees what, and keeps contact details and documents private", () => {
  assert.equal(DATA_NOTICE_TITLE, "How your information is used");
  assert.match(all, /administrators review everything you send/i);
  assert.match(all, /CV, certificates, photograph, email address and phone number are not displayed on your public advisor profile\./);
  assert.doesNotMatch(all, /never shown publicly/i);
  assert.match(all, /public profile shows your name, designation, institution, location, specializations, years of experience, research areas, biography and the consultation services/i);
});

test("the notice points to the one confirmed contact address and invents no commitments", () => {
  assert.equal(CONTACT_EMAIL, "ruwadplatform@gmail.com");
  assert.ok(DATA_NOTICE_POINTS.some((p) => p.includes("ruwadplatform@gmail.com")));
  assert.doesNotMatch(all, /karama/i);
  // No retention period, deletion promise, legal basis or compliance claim: those are the owner's and counsel's to decide.
  assert.doesNotMatch(all, /\b(retain|retention|delete|deleted|deletion|erase|days|months|years of storage|PDPL|GDPR|compliant|compliance|consent)\b/i);
});

test("the notice says it does not replace the full Privacy Policy, and does so in its last line", () => {
  assert.equal(DATA_NOTICE_POINTS[DATA_NOTICE_POINTS.length - 1], "This notice does not replace RUWĀD's full Privacy Policy.");
});

test("advisor wording promises no requests or bookings while online booking is closed", () => {
  assert.doesNotMatch(PENDING_REVIEW_COPY, /receive requests|bookings?\b/i);
  assert.doesNotMatch(SUSPENDED_COPY, /bookings?\b/i);
  assert.match(ADVISOR_BOOKING_NOT_OPEN_NOTE, /^Online booking is not open yet\./);
  assert.match(ADVISOR_BOOKING_NOT_OPEN_NOTE, /once RUWĀD opens booking/);
});
