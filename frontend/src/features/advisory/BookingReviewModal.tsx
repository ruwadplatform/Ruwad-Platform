"use client";

import { useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { AuthGateModalContent } from "@/components/shared/AuthGateModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { stashReturnRoute } from "@/lib/store";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, parseYmd } from "./advisory-time";
import type { Slot } from "./advisory-slots";
import type { AdvisorProfile, AdvisorService } from "./advisory-types";

export interface BookingDraft {
  advisor: AdvisorProfile;
  service: AdvisorService;
  /** Riyadh calendar date "YYYY-MM-DD". */
  dateKey: string;
  slot: Slot;
  description: string;
  /** The zone the person chose to see times in. */
  timeZone: string;
}

/** The booking review shown when someone clicks Continue Booking. In this release it is a DEMONSTRATION: confirming never creates a booking,
 * saves anything or sends a notification. A signed-out visitor who confirms is asked to sign in (and returned to this page afterwards). */
export function BookingReviewModal({ draft }: { draft: BookingDraft }) {
  const { closeModal, openModal } = useModal();
  const { loggedIn } = useSession();
  const [confirmed, setConfirmed] = useState(false);
  const { advisor, service, slot, dateKey, description, timeZone } = draft;
  const date = parseYmd(dateKey);
  const riyadhTime = `${formatClock(slot.start, RIYADH_TZ)} (${offsetLabel(slot.start, RIYADH_TZ)})`;
  const ownTime = timeZone !== RIYADH_TZ ? `${formatClock(slot.start, timeZone)} (${offsetLabel(slot.start, timeZone)})` : null;

  function confirm() {
    if (!loggedIn) {
      stashReturnRoute(window.location.pathname);
      closeModal();
      openModal(
        <AuthGateModalContent
          title="Sign in to confirm your booking"
          body="Booking a consultation needs a RUWĀD account. Nothing has been booked or saved. Sign in, then choose your time again."
          benefits={["Choose your startup profile for the consultation", "Manage your consultations in one place", "Join the online meeting through RUWĀD"]}
        />,
      );
      return;
    }
    setConfirmed(true);
  }

  const rows: [string, string][] = [
    ["Advisor", advisor.name],
    ["Institution", `${advisor.institutionFull}${advisor.affiliationVerified ? "" : " (listed affiliation, not verified)"}`],
    ["Consultation type", service.name],
    ["Date", formatDateUS(date)],
    ["Time", ownTime ? `${ownTime} · ${riyadhTime} in Riyadh` : riyadhTime],
    ["Duration", `${service.minutes} minutes`],
    ["Meeting format", "Online via RUWĀD"],
    ["Consultation description", description.trim() || "Not provided"],
  ];

  return (
    <div className="modal-box-pad adv-review">
      <h3 className="fs-16">{confirmed ? "Demonstration only — nothing was booked" : "Review your booking"}</h3>
      {advisor.isDemo && <span className="adv-demo mt-8">Demo profile</span>}
      <dl className="adv-review-list">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {confirmed ? (
        <>
          <p className="adv-review-note"><RuwadIcon name="info" size={14} /> This is a preview. No booking was created, no calendar time was reserved and no notification was sent. Real bookings arrive in a later release.</p>
          <button type="button" className="btn btn-primary btn-block mt-16" onClick={closeModal}>Close</button>
        </>
      ) : (
        <>
          <p className="adv-review-note"><RuwadIcon name="info" size={14} /> Demonstration preview: confirming will not create a real booking or send any notification.</p>
          <div className="adv-review-actions">
            <button type="button" className="btn btn-outline" onClick={closeModal}>Edit details</button>
            <button type="button" className="btn btn-primary" onClick={confirm}>Confirm booking</button>
          </div>
        </>
      )}
    </div>
  );
}
