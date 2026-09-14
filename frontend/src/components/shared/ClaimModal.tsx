"use client";

import { useState } from "react";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { submitClaim } from "@/lib/store";
import { notifyStoreChange } from "@/hooks/use-store";

/** Ported verbatim from openClaimModal()/confirmClaim() (js/profiles.js:49-71). */
export function ClaimModal({ startupId, startupName }: { startupId: string; startupName: string }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");

  function confirm() {
    if (!role.trim()) {
      toast("Enter your role at the company");
      return;
    }
    const claim = submitClaim(startupId, { role: role.trim(), note: note.trim() });
    if (!claim) {
      toast("Unable to submit — you may already have a claim pending");
      return;
    }
    closeModal();
    toast("Claim request submitted for review");
    notifyStoreChange();
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Claim {startupName}</h3>
      <p className="muted small mt-8">Tell us your role at the company. This submits a request for RUWĀD to review — it doesn&apos;t grant edit access immediately, since there&apos;s no automated way yet to verify company ownership.</p>
      <div className="field mt-16"><label>Your Role</label><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Founder & CEO" /></div>
      <div className="field mt-12">
        <label>Verification Note</label>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`How can RUWĀD verify you're affiliated with ${startupName}? (e.g. company email domain, LinkedIn profile)`} />
      </div>
      <button className="btn btn-primary btn-block btn-lg mt-16" onClick={confirm}>Submit Claim Request</button>
    </div>
  );
}
