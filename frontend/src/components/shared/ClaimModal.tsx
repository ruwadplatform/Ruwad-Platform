"use client";

import { useState } from "react";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { submitClaim, type ClaimEntityKind } from "@/lib/api/claims";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

/** Submits a real, persisted claim request (`POST /organizations/claims`) for an admin to review — replaces the earlier
 * localStorage-only mock, which never reached the backend and so could never actually be approved. */
export function ClaimModal({ entityId, entityName, kind = "STARTUP", onSubmitted }: { entityId: string; entityName: string; kind?: ClaimEntityKind; onSubmitted?: () => void }) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!role.trim()) {
      toast("Enter your role at the company");
      return;
    }
    setBusy(true);
    try {
      await submitClaim(kind, entityId, role.trim(), note.trim() || undefined);
      closeModal();
      toast("Claim request submitted for review");
      onSubmitted?.();
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Claim {entityName}</h3>
      <p className="muted small mt-8">Tell us your role at the company. This submits a request for RUWĀD to review — it doesn&apos;t grant edit access immediately, since there&apos;s no automated way yet to verify company ownership.</p>
      <div className="field mt-16"><label>Your Role</label><input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Founder & CEO" disabled={busy} /></div>
      <div className="field mt-12">
        <label>Verification Note</label>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`How can RUWĀD verify you're affiliated with ${entityName}? (e.g. company email domain, LinkedIn profile)`} disabled={busy} />
      </div>
      <button className="btn btn-primary btn-block btn-lg mt-16" onClick={confirm} disabled={busy}>{busy ? "Submitting…" : "Submit Claim Request"}</button>
    </div>
  );
}
