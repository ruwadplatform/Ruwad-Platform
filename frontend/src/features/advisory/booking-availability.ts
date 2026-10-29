/** Online consultation booking is switched off on the server (ADVISORY_BOOKINGS_ENABLED) until the RUWĀD team opens it. This file holds the words, the
 * error code and the "contact RUWĀD" email that every screen shares. It has no React in it so it can be tested on its own. The server is the authority:
 * it refuses every booking route with HTTP 403 and the code below. The screens use this only to say so kindly, and to avoid asking people to fill in
 * a request that can't be made. */

/** The exact message people see. The server sends the same words with its 403. */
export const BOOKINGS_UNAVAILABLE_MESSAGE = "Online consultation booking is currently unavailable. Please contact the RUWĀD team to arrange your consultation.";

/** The `code` field of the server's 403 answer. */
export const BOOKINGS_DISABLED_CODE = "BOOKINGS_DISABLED";

/** The RUWĀD team's address for arranging a consultation. One constant, so it is changed in exactly one place. */
export const CONTACT_EMAIL = "ruwadplatform@gmail.com";

/** A shorter line for places that are not the confirmation (the booking panel, the review note, the "how it works" explainer). */
export const BOOKINGS_NOT_OPEN_NOTE = "Online booking is not open yet. You can browse advisors, services and times here; to arrange a consultation, contact the RUWĀD team.";

/** True for the server's controlled "bookings are switched off" answer (an ApiError carrying that code). */
export function isBookingsDisabledError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === BOOKINGS_DISABLED_CODE;
}

/** What the public status endpoint answered, read strictly: ONLY an explicit `bookingsEnabled: true` opens booking. A missing, malformed or failed answer
 * means "not open", so a screen can never offer a booking the server hasn't switched on. */
export function bookingsOpenFrom(answer: unknown): boolean {
  return typeof answer === "object" && answer !== null && (answer as { bookingsEnabled?: unknown }).bookingsEnabled === true;
}

export interface ContactDetails {
  advisorName?: string | null;
  serviceName?: string | null;
  /** The chosen time as the screen shows it, for example "November 1, 2026 · 09:00 AM (UTC+3), Riyadh time". Left out when nothing is chosen yet. */
  when?: string | null;
}

/** A `mailto:` link to the RUWĀD team with the subject and body already written from what the person chose. Only what is known is included. */
export function contactMailto({ advisorName, serviceName, when }: ContactDetails = {}): string {
  const advisor = advisorName?.trim();
  const service = serviceName?.trim();
  const time = when?.trim();
  const subject = ["Consultation request", [advisor, service].filter(Boolean).join(" · ")].filter(Boolean).join(": ");
  const lines = ["Hello RUWĀD team,", "", "I would like to arrange an online consultation."];
  if (advisor || service || time) lines.push("");
  if (advisor) lines.push(`Advisor: ${advisor}`);
  if (service) lines.push(`Consultation: ${service}`);
  if (time) lines.push(`Date and time: ${time}`);
  lines.push("", "My name and startup:", "", "Thank you.");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\r\n"))}`;
}
