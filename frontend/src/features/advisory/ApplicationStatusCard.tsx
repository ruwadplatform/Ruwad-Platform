"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { formatBytes } from "@/lib/api/data-room-files";
import type { ApplicationStage, ApplicationStatus } from "./advisory-types";
import { formatWhen } from "./booking-format";

const STAGE: Record<ApplicationStage, { label: string; cls: string; summary: string }> = {
  PENDING_REVIEW: { label: "Pending review", cls: "adv-badge-warn", summary: "The RUWĀD team is reviewing your application. You'll be notified by email when there is a decision." },
  APPROVED: { label: "Approved", cls: "adv-badge-good", summary: "Your application was approved. Your advisor profile is live in the directory." },
  REJECTED: { label: "Rejected", cls: "adv-badge-crit", summary: "Your application was not approved at this time." },
  SUSPENDED: { label: "Suspended", cls: "adv-badge-crit", summary: "Your advisor profile is suspended and hidden from the directory." },
};

type StepState = "done" | "current" | "todo" | "bad";
function steps(stage: ApplicationStage): { label: string; state: StepState }[] {
  const decided = stage !== "PENDING_REVIEW";
  return [
    { label: "Application submitted", state: "done" },
    { label: "Pending review", state: decided ? "done" : "current" },
    { label: stage === "REJECTED" ? "Rejected" : stage === "SUSPENDED" ? "Suspended" : "Approved", state: !decided ? "todo" : stage === "APPROVED" ? "done" : "bad" },
  ];
}

/** An applicant's own view of their application: where it stands, the dates, the documents they sent, and (only if it was rejected) the reason,
 * which is private to them. The reviewer's internal notes are never part of this data. */
export function ApplicationStatusCard({ application: a, compact }: { application: ApplicationStatus; compact?: boolean }) {
  const s = STAGE[a.stage];
  const submitted = a.timeline.find((t) => t.type === "SUBMITTED")?.at ?? a.submittedAt;
  return (
    <div className={`adv-appstatus${compact ? " is-compact" : ""}`}>
      <div className="adv-appstatus-head">
        <div>
          <span className={`badge ${s.cls}`}>{s.label}</span>
          <p className="adv-about mt-8">{s.summary}</p>
        </div>
        <div className="adv-ref">Reference <b>{a.reference}</b></div>
      </div>

      <ol className="adv-steps" aria-label="Application progress">
        {steps(a.stage).map((st) => (
          <li key={st.label} className={`adv-step is-${st.state}`} aria-current={st.state === "current" ? "step" : undefined}>
            <span className="adv-step-dot" aria-hidden="true">{st.state === "done" ? <RuwadIcon name="check" size={12} /> : st.state === "bad" ? "!" : ""}</span>
            <span>{st.label}</span>
          </li>
        ))}
      </ol>

      <dl className="adv-appstatus-dates">
        {submitted && <div><dt>Submitted</dt><dd>{formatWhen(submitted)}</dd></div>}
        {a.decidedAt && <div><dt>{a.stage === "REJECTED" ? "Decision" : "Updated"}</dt><dd>{formatWhen(a.decidedAt)}</dd></div>}
      </dl>

      {a.stage === "REJECTED" && a.rejectionReason && (
        <div className="adv-reason" role="note">
          <b>Reason from the RUWĀD team</b>
          <p>{a.rejectionReason}</p>
          <span className="muted small"><RuwadIcon name="lock" size={12} /> Only you can see this.</span>
        </div>
      )}

      {!compact && a.documents.length > 0 && (
        <div className="adv-appdocs">
          <b>Documents you sent</b>
          <ul>
            {a.documents.map((d, i) => <li key={`${d.fileName}-${i}`}><span className="adv-filename">{d.fileName}</span><span className="muted adv-filesize">{d.kind === "CV" ? "CV" : d.kind === "PHOTO" ? "Photograph" : "Certificate"} · {formatBytes(d.size)}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
