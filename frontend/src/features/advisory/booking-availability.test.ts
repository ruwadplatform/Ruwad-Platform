import assert from "node:assert/strict";
import test from "node:test";
import { BOOKINGS_DISABLED_CODE, BOOKINGS_UNAVAILABLE_MESSAGE, CONTACT_EMAIL, bookingsOpenFrom, contactMailto, isBookingsDisabledError } from "./booking-availability.ts";

const parse = (href: string) => {
  const [scheme, query] = href.split("?");
  const params = new URLSearchParams(query);
  return { to: scheme!.replace("mailto:", ""), subject: params.get("subject")!, body: params.get("body")! };
};

test("the message and code are exactly the agreed ones", () => {
  assert.equal(BOOKINGS_UNAVAILABLE_MESSAGE, "Online consultation booking is currently unavailable. Please contact the RUWĀD team to arrange your consultation.");
  assert.equal(BOOKINGS_DISABLED_CODE, "BOOKINGS_DISABLED");
});

test("the server's controlled 403 is recognised by its code, and nothing else is", () => {
  assert.equal(isBookingsDisabledError(Object.assign(new Error("x"), { status: 403, code: "BOOKINGS_DISABLED" })), true);
  assert.equal(isBookingsDisabledError({ code: "BOOKINGS_DISABLED" }), true);
  assert.equal(isBookingsDisabledError(Object.assign(new Error("x"), { status: 403 })), false); // an ordinary 403 is not "bookings are off"
  assert.equal(isBookingsDisabledError(Object.assign(new Error("x"), { status: 409, code: "SLOT_TAKEN" })), false);
  assert.equal(isBookingsDisabledError(new Error("Failed to fetch")), false);
  assert.equal(isBookingsDisabledError(null), false);
  assert.equal(isBookingsDisabledError(undefined), false);
  assert.equal(isBookingsDisabledError("BOOKINGS_DISABLED"), false);
});

test("booking counts as open ONLY for an explicit bookingsEnabled: true (fail closed)", () => {
  assert.equal(bookingsOpenFrom({ bookingsEnabled: true }), true);
  for (const answer of [{ bookingsEnabled: false }, {}, { bookingsEnabled: "true" }, { bookingsEnabled: 1 }, { bookingsEnabled: null }, null, undefined, "true", 1, [], { enabled: true }]) {
    assert.equal(bookingsOpenFrom(answer), false, JSON.stringify(answer));
  }
});

test("the contact address is the owner-confirmed one, and no other address is ever used", () => {
  assert.equal(CONTACT_EMAIL, "ruwadplatform@gmail.com");
  for (const details of [{}, { advisorName: "Dr. A" }, { advisorName: "Dr. A", serviceName: "S", when: "W" }]) {
    const link = contactMailto(details);
    assert.ok(link.startsWith("mailto:ruwadplatform@gmail.com?"), link);
    assert.equal((link.match(/@/g) ?? []).length, 1); // one address only: no cc, no second recipient
    assert.doesNotMatch(decodeURIComponent(link), /karama/i);
  }
});

test("the contact link goes to the RUWĀD address with the subject and body written from what was chosen", () => {
  const link = contactMailto({ advisorName: "Dr. Sara Al-Qahtani", serviceName: "Research Project Review", when: "November 1, 2026 · 09:00 AM (UTC+3), Riyadh time" });
  assert.ok(link.startsWith(`mailto:${CONTACT_EMAIL}?subject=`));
  const { to, subject, body } = parse(link);
  assert.equal(to, "ruwadplatform@gmail.com"); // the owner-confirmed address
  assert.equal(subject, "Consultation request: Dr. Sara Al-Qahtani · Research Project Review");
  assert.match(body, /Advisor: Dr\. Sara Al-Qahtani/);
  assert.match(body, /Consultation: Research Project Review/);
  assert.match(body, /Date and time: November 1, 2026 · 09:00 AM \(UTC\+3\), Riyadh time/);
  assert.match(body, /^Hello RUWĀD team,/);
});

test("only what is known is included: no advisor, no service, no time and never the word undefined or null", () => {
  const justAdvisor = parse(contactMailto({ advisorName: "Dr. A" }));
  assert.equal(justAdvisor.subject, "Consultation request: Dr. A");
  assert.doesNotMatch(justAdvisor.body, /Consultation:|Date and time:/);

  const nothing = parse(contactMailto());
  assert.equal(nothing.subject, "Consultation request");
  assert.doesNotMatch(nothing.body, /Advisor:|Consultation:|Date and time:/);

  for (const link of [contactMailto({ advisorName: null, serviceName: undefined, when: "" }), contactMailto({ advisorName: "  ", serviceName: " ", when: " " }), contactMailto()]) {
    const { subject, body } = parse(link);
    assert.doesNotMatch(subject + body, /undefined|null/);
    assert.equal(subject, "Consultation request");
  }
});

test("characters that could break the link are encoded, so the address and body stay intact", () => {
  const link = contactMailto({ advisorName: "Prof. A & B", serviceName: "Q&A? 100% #1", when: "x" });
  assert.equal(link.split("?").length, 2); // one query string
  assert.equal(link.match(/&/g)!.length, 1); // only the separator between subject and body is a bare &
  const { subject } = parse(link);
  assert.equal(subject, "Consultation request: Prof. A & B · Q&A? 100% #1");
});
