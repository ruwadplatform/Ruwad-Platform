"use client";

import Link from "next/link";
import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { AuthGateModalContent } from "@/components/shared/AuthGateModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { ApiError } from "@/lib/api/client";
import { createBooking } from "@/lib/api/advisory";
import { stashReturnRoute } from "@/lib/store";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, riyadhDate } from "./advisory-time";
import type { AdvisorProfile, AdvisorService, BookableStartup, BookingView } from "./advisory-types";
import { BOOKINGS_NOT_OPEN_NOTE, BOOKINGS_UNAVAILABLE_MESSAGE, isBookingsDisabledError } from "./booking-availability";
import { errText } from "./booking-format";
import { ContactRuwadLink } from "./ContactRuwadLink";
import { fetchBookingsOpen, useBookingsStatus } from "./use-bookings-status";

export interface BookingDraft {
  advisor: AdvisorProfile;
  service: AdvisorService;
  /** The startup the booking is for; null while signed out (the sign-in prompt comes first). */
  startup: BookableStartup | null;
  /** The chosen slot, ISO-8601 instants. */
  startsAt: string;
  description: string;
  /** The zone the person chose to see times in. */
  timeZone: string;
}

/** The booking review shown when someone clicks Continue Booking, and where the request is actually sent.
 *
 * Nothing is shown as booked until the backend says so: Confirm sends the request, and only a successful response switches this to "Request sent".
 * A failure (the slot was just taken, the session expired, the server is down…) is shown here and nothing is claimed. A signed-out visitor who
 * confirms is asked to sign in first and returned to this page afterwards. */
export function BookingReviewModal({ draft, onBooked, onSlotTaken }: { draft: BookingDraft; onBooked: () => void; onSlotTaken: () => void }) {
  const { closeModal, openModal } = useModal();
  const { loggedIn } = useSession();
  const [phase, setPhase] = useState<"review" | "sending" | "sent">("review");
  const [error, setError] = useState<{ message: string; taken: boolean } | null>(null);
  const [booking, setBooking] = useState<BookingView | null>(null);
  /** Set when the server says online booking is not open: the message and the way to arrange a consultation replace Confirm. */
  const [unavailable, setUnavailable] = useState(false);
  const bookings = useBookingsStatus();
  const { advisor, service, startup, startsAt, description, timeZone } = draft;
  const start = new Date(startsAt);
  const date = riyadhDate(start);
  const riyadhTime = `${formatClock(start, RIYADH_TZ)} (${offsetLabel(start, RIYADH_TZ)})`;
  const ownTime = timeZone !== RIYADH_TZ ? `${formatClock(start, timeZone)} (${offsetLabel(start, timeZone)})` : null;

  const when = `${formatDateUS(date)} · ${riyadhTime}, Riyadh time`;

  async function confirm() {
    // Online booking is switched off on the server until RUWĀD opens it. Ask it right now (not a cached answer) and, if it is closed, say so and show how to arrange the
    // consultation instead of asking a signed-out visitor to sign in or sending a request that cannot be made. No booking call is made. Should the answer be wrong or
    // stale, the server still refuses the booking itself with BOOKINGS_DISABLED and the same message is shown below.
    setError(null);
    setPhase("sending");
    const open = await fetchBookingsOpen(true);
    setPhase("review");
    if (!open) { setUnavailable(true); return; }
    if (!loggedIn) {
      stashReturnRoute(window.location.pathname);
      closeModal();
      openModal(
        <AuthGateModalContent
          title="Sign in to confirm your booking"
          body="Booking a consultation needs a RUWĀD account. Nothing has been booked yet. Sign in, then choose your time again."
          benefits={["Choose your startup profile for the consultation", "Manage your consultations in one place", "Join the online meeting through RUWĀD"]}
        />,
      );
      return;
    }
    if (!startup) return;
    setPhase("sending");
    setError(null);
    try {
      const made = await createBooking({ advisor: advisor.id, serviceId: service.id, startupId: startup.id, startsAt, description: description.trim() || undefined });
      setBooking(made);
      setPhase("sent");
      onBooked();
    } catch (e) {
      setPhase("review");
      if (isBookingsDisabledError(e)) { setUnavailable(true); return; }
      setError({ message: errText(e), taken: e instanceof ApiError && e.status === 409 });
      if (e instanceof ApiError && e.status === 409) onSlotTaken();
    }
  }

  const rows: [string, string][] = [
    ["Advisor", advisor.name],
    ["Institution", `${advisor.institutionFull}${advisor.affiliationVerified ? "" : " (listed affiliation, not verified)"}`],
    ["Consultation type", service.name],
    ["Booking for", startup?.name ?? "Your startup (chosen after you sign in)"],
    ["Date", formatDateUS(date)],
    ["Time", ownTime ? `${ownTime} · ${riyadhTime} in Riyadh` : riyadhTime],
    ["Duration", `${service.minutes} minutes`],
    ["Meeting format", "Online via RUWĀD"],
    ["Consultation description", description.trim() || "Not provided"],
  ];
  if (booking) rows.unshift(["Reference", booking.reference]);

  return (
    <div className="modal-box-pad adv-review">
      <h3 className="fs-16">{phase === "sent" ? "Request sent" : "Review your booking"}</h3>
      {advisor.isDemo && <span className="adv-demo mt-8">Demo profile</span>}
      <dl className="adv-review-list">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {error && <p className="adv-review-note adv-review-error" role="alert"><RuwadIcon name="info" size={14} /> {error.message}</p>}
      {unavailable && <p className="adv-review-note adv-review-error" role="alert"><RuwadIcon name="info" size={14} /> {BOOKINGS_UNAVAILABLE_MESSAGE}</p>}
      {phase === "sent" && booking ? (
        <>
          <p className="adv-review-note"><RuwadIcon name="info" size={14} /> {advisor.isDemo
            ? "This is a demonstration advisor, so the request is recorded as a demonstration. No email is sent and nobody will answer it."
            : `${advisor.name} needs to approve your request. The time is held for you until they answer, and you'll find it under My Consultations.`}</p>
          <div className="adv-review-actions">
            <button type="button" className="btn btn-outline" onClick={closeModal}>Close</button>
            <Link className="btn btn-primary" href={`/workspace/consultations/${booking.id}`} onClick={closeModal}>View my consultation</Link>
          </div>
        </>
      ) : (
        <>
          {!unavailable && (
            <p className="adv-review-note"><RuwadIcon name="info" size={14} /> {bookings !== "open"
              ? BOOKINGS_NOT_OPEN_NOTE
              : advisor.isDemo
                ? "Demonstration advisor: your request is recorded as a demonstration. No email is sent."
                : "Your request goes to the advisor for approval. The time is held for you while they decide. Nothing is charged."}</p>
          )}
          <div className="adv-review-actions">
            {error?.taken
              ? <button type="button" className="btn btn-primary" onClick={closeModal}>Choose another time</button>
              : unavailable
              ? (
                <>
                  <button type="button" className="btn btn-outline" onClick={closeModal}>Close</button>
                  <ContactRuwadLink details={{ advisorName: advisor.name, serviceName: service.name, when }} />
                </>
              )
              : (
                <>
                  <button type="button" className="btn btn-outline" onClick={closeModal} disabled={phase === "sending"}>Edit details</button>
                  <button type="button" className="btn btn-primary" onClick={confirm} disabled={phase === "sending" || (loggedIn && !startup)}>{phase === "sending" ? "Sending…" : "Confirm booking"}</button>
                </>
              )}
          </div>
        </>
      )}
    </div>
  );
}
