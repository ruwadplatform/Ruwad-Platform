"use client";

import { useEffect, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { ClaimModal } from "@/components/shared/ClaimModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { requireAuth } from "@/lib/store";
import { fetchMyClaim, type Claim, type ClaimEntityKind } from "@/lib/api/claims";
import type { VerificationTier } from "@/types/entities";

const VERIFIED_HINT: Partial<Record<ClaimEntityKind, string>> = {
  STARTUP: "Regulatory and clinical documentation reviewed by RUWĀD",
};

/** The profile-header status badge: Verified / Self-Reported / Unclaimed Profile. */
export function VerifiedBadge({ status, kind = "STARTUP" }: { status: VerificationTier; kind?: ClaimEntityKind }) {
  if (status === "verified") return <span className="badge badge-good" title={VERIFIED_HINT[kind] ?? "Information on this profile reviewed by RUWĀD"}><RuwadIcon name="check" size={10} /> Verified</span>;
  if (status === "self-reported") return <span className="badge badge-warn" title="Submitted by the company; not independently reviewed"><RuwadIcon name="help" size={10} /> Self-Reported</span>;
  return <span className="badge badge-neutral" title="This profile has not been claimed or reviewed"><RuwadIcon name="help" size={10} /> Unclaimed Profile</span>;
}

/** Whether a profile shows the claim button at all: only an unclaimed listing that has a backend id. */
export const canShowClaim = (verified: VerificationTier, entityId?: string) => verified === "unclaimed" && !!entityId;

/** "Claim" on an unclaimed listing: sends a claim request an admin reviews. Shows a disabled "pending review" state once one exists. */
export function ClaimCta({ kind = "STARTUP", entityId, entityName, verified, hasPendingClaim, loggedIn }: {
  kind?: ClaimEntityKind; entityId?: string; entityName: string; verified: VerificationTier; hasPendingClaim: boolean; loggedIn: boolean;
}) {
  const { openModal } = useModal();
  const toast = useToast();
  const { hydrated } = useSession();
  const [myClaim, setMyClaim] = useState<Claim | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  useEffect(() => {
    if (!hydrated || !loggedIn || verified !== "unclaimed") return;
    let live = true;
    fetchMyClaim().then((c) => { if (live) setMyClaim(c); }).catch(() => undefined);
    return () => { live = false; };
  }, [hydrated, loggedIn, verified]);

  if (!canShowClaim(verified, entityId)) return null;
  const mine = myClaim?.entityId === entityId;
  const pending = hasPendingClaim || justSubmitted || mine;

  if (!pending) {
    return (
      <button
        className="btn btn-outline"
        title="Claim This Listing"
        aria-label="Claim This Listing"
        onClick={() => {
          if (!requireAuth("claim-company", { entityId })) return;
          if (myClaim) { toast(myClaim.entityId === entityId ? "This listing already has a claim under review" : "You already have a claim under review — one company claim per account"); return; }
          openModal(<ClaimModal kind={kind} entityId={entityId!} entityName={entityName} onSubmitted={() => setJustSubmitted(true)} />);
        }}
      >
        <RuwadIcon name="check" size={14} /> Claim
      </button>
    );
  }
  return (
    <button className="btn btn-outline" disabled title={mine || justSubmitted ? "Your claim is under review" : "A claim for this listing is already under review"}>
      <RuwadIcon name="clock" size={14} /> {mine || justSubmitted ? "Your Claim: Pending Review" : "Claim Pending Review"}
    </button>
  );
}
