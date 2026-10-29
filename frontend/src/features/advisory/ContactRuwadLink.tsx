import type { ReactNode } from "react";
import { type ContactDetails, contactMailto } from "./booking-availability";

/** "Contact RUWĀD": opens the visitor's email app addressed to the RUWĀD team, with the subject and body already written from what they chose
 * (advisor, consultation, date and time when known). A plain link, so it works for signed-out visitors too and needs no script. */
export function ContactRuwadLink({ details, className = "btn btn-primary", children = "Contact RUWĀD" }: { details: ContactDetails; className?: string; children?: ReactNode }) {
  return <a className={className} href={contactMailto(details)}>{children}</a>;
}
