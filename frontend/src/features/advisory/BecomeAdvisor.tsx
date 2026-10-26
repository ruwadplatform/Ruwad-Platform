"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { AuthGateModalContent } from "@/components/shared/AuthGateModal";
import { ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { fetchMyAdvisorProfile } from "@/lib/api/advisory";
import { stashReturnRoute } from "@/lib/store";
import { AdvisorApplicationForm, type SubmittedApplication } from "./AdvisorApplicationForm";
import { ApplicationStatusCard } from "./ApplicationStatusCard";
import { useAsync } from "./use-async";
import type { ApplicationValues } from "./application-form";

export const APPLY_QUERY = "apply=1";
export const SUCCESS_MESSAGE = "Your advisor application has been submitted successfully. The RUWĀD team will review your application and notify you by email.";

/** What the signed-in person's account already knows, to save typing. Everything stays editable. */
export function usePrefill(): Partial<ApplicationValues> {
  const { user } = useSession();
  if (!user) return {};
  const where = [user.city, user.country].filter(Boolean).join(", ");
  return {
    name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, ...(user.phone ? { phone: user.phone } : {}), ...(user.jobTitle ? { designation: user.jobTitle } : {}),
    ...(where ? { location: where } : {}), ...(user.org?.name ? { institution: user.org.name } : {}), ...(user.linkedin ? { linkedinUrl: user.linkedin } : {}),
  };
}

export function SubmittedPanel({ reference, onClose, onView }: { reference: string; onClose: () => void; onView: () => void }) {
  return (
    <div className="adv-submitted" role="status">
      <span className="adv-submitted-icon" aria-hidden="true"><RuwadIcon name="check" size={28} /></span>
      <h3 className="adv-sec-title">Application submitted</h3>
      <p className="adv-about">{SUCCESS_MESSAGE}</p>
      <p className="adv-ref">Reference <b>{reference}</b></p>
      <div className="adv-review-actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-primary" onClick={onView}>View application status</button>
      </div>
    </div>
  );
}

/** Opens from the Advisory Services page. If this account already applied it shows where that application stands instead of a second form
 * (the server refuses a second application too). */
export function BecomeAdvisorModal() {
  const { closeModal } = useModal();
  const router = useRouter();
  const prefill = usePrefill();
  const me = useAsync("become-advisor-me", fetchMyAdvisorProfile);
  const [done, setDone] = useState<SubmittedApplication | null>(null);
  const goDashboard = () => { closeModal(); router.push("/workspace/advisor"); };

  return (
    <div className="modal-box-pad adv-become">
      <h3 className="fs-16">Become an Advisor</h3>
      {done ? (
        <SubmittedPanel reference={done.reference} onClose={closeModal} onView={goDashboard} />
      ) : me.loading ? (
        <LoadingState title="Checking your account…" />
      ) : me.error ? (
        <ErrorState title="Couldn't open the application" body={me.error} />
      ) : me.data?.advisor ? (
        <div className="mt-12">
          <p className="adv-about">You have already applied to join RUWĀD Advisory Services, so there is nothing more to submit.</p>
          {me.data.advisor.application ? <ApplicationStatusCard application={me.data.advisor.application} compact /> : null}
          <div className="adv-review-actions">
            {me.data.advisor.application?.canReapply
              ? <button type="button" className="btn btn-primary" onClick={() => { closeModal(); router.push("/workspace/advisor?reapply=1"); }}>Edit &amp; Reapply</button>
              : <button type="button" className="btn btn-primary" onClick={goDashboard}>{me.data.advisor.status === "APPROVED" ? "Open Advisor Dashboard" : "View application status"}</button>}
          </div>
        </div>
      ) : (
        <>
          <p className="muted small mt-8">Professors, researchers, scientists and professional consultants can apply to advise founders on RUWĀD. The RUWĀD team reviews every application before an advisor profile is published.</p>
          <div className="mt-16">
            <AdvisorApplicationForm prefill={prefill} onSubmitted={setDone} />
          </div>
        </>
      )}
    </div>
  );
}

/** Starts "Become an Advisor". Signed in: the application opens. Signed out: they're asked to sign in or create an account, and after doing so are
 * returned to this page with the application opening on its own (the page looks for `?apply=1`). Reuses the platform's own sign-in. */
export function useBecomeAdvisor() {
  const { openModal } = useModal();
  const { loggedIn } = useSession();
  return useCallback(() => {
    if (!loggedIn) {
      stashReturnRoute(`${window.location.pathname}?${APPLY_QUERY}`);
      openModal(
        <AuthGateModalContent
          title="Sign in to become an advisor"
          body="Applying to become an advisor needs a RUWĀD account. Sign in or create one, and you'll come straight back to the application."
          benefits={["Apply once with your professional details", "Track your application's status in your workspace", "Manage your availability and consultations once approved"]}
        />,
      );
      return;
    }
    openModal(<BecomeAdvisorModal />, "wide");
  }, [loggedIn, openModal]);
}
