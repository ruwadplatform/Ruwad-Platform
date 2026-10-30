import { CONTACT_EMAIL } from "./booking-availability.ts";

/** What an applicant is told about their information, and what advisors are told while online booking is closed. Plain statements of how the screens and
 * the server behave today, nothing more: they promise no retention period, no deletion and no legal position. Those are for the owner and counsel to decide
 * (see docs/advisory-privacy-notice-draft.md); if the behaviour changes, change these words with it. */

export const DATA_NOTICE_TITLE = "How your information is used";

export const DATA_NOTICE_POINTS: string[] = [
  "RUWĀD administrators review everything you send: your details, biography, CV, certificates and photograph. The RUWĀD team is also sent a notification with your application details, including your email address and phone number.",
  "If you are approved, your public profile shows your name, designation, institution, location, specializations, years of experience, research areas, biography and the consultation services you list. Your CV, certificates, photograph, email address and phone number are not displayed on your public advisor profile.",
  "We email you about your application at your RUWĀD account address.",
  `Questions about your information: contact RUWĀD at ${CONTACT_EMAIL}.`,
  "This notice does not replace RUWĀD's full Privacy Policy.",
];

/** Shown to an approved advisor while the server has not opened online booking, so nobody expects requests that cannot arrive. */
export const ADVISOR_BOOKING_NOT_OPEN_NOTE = "Online booking is not open yet. You can complete your profile, services and availability now. Consultation requests will appear here once RUWĀD opens booking.";

/** The advisor dashboard's messages for an application that is not approved. Neither promises requests or bookings. */
export const PENDING_REVIEW_COPY = "A RUWĀD administrator will review your profile. Once it is approved you can set your hours and add your services. You can still edit your profile meanwhile.";
export const SUSPENDED_COPY = "Your profile is hidden from the directory. Contact RUWĀD for details.";
