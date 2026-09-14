"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useAuthGateModal } from "./AuthGateModal";

/** Ported verbatim from contactLockHtml() (js/profiles.js:321-323). */
export function ContactLock() {
  const openAuthGate = useAuthGateModal();
  return (
    <span
      className="contact-lock"
      onClick={() => openAuthGate({ title: "Unlock Contact Intelligence", benefits: ["Direct business contact details", "Founder & investor relations contacts", "Request introductions directly"] })}
    >
      <RuwadIcon name="lock" size={11} /> Sign in to access
    </span>
  );
}
