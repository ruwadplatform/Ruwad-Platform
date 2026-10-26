"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { formatBytes } from "@/lib/api/data-room-files";
import type { ApplicationStage, ApplicationStatus } from "./advisory-types";
import { formatWhen } from "./booking-format";

const STAGE: Record<ApplicationStage, { label: string; cls: string; summary: string }> = {
  PENDING_REVIEW: { label: "Under review", cls: "adv-badge-warn", summary: "The RUWĀD team is reviewing your application. You'll be notified by email when there is a decision." },
  APPROVED: { label: "Approved", cls: "adv-badge-good", summary: "Your application was approved. Your advisor profile is live in the directory." },
  REJECTED: { label: "Rejected", cls: "adv-badge-crit", summary: "Your application was not approved at this time. You can update it and submit it again." },
  SUSPENDED: { label: "Suspended", cls: "adv-badge-crit", summary: "Your advisor profile is suspended and hidden from the directory." },
};

type StepState = "done" | "current" | "todo" | "bad";
/** Submitted -> Under review -> the outcome (Approved or Rejected, whichever happened). */
export function trackerSteps(stage: ApplicationStage): { label: string; state: StepState }[] {
  const decided = stage !== "PENDING_REVIEW";
  return [
    { label: "Submitted", state: "done" },
    { label: "Under review", state: decided ? "done" : "current" },
    { label: stage === "REJECTED" ? "Rejected" : stage === "SUSPENDED" ? "Suspended" : "Approved", state: !decided ? "todo" : stage === "APPROVED" ? "done" : "bad" },
  ];
}

/** An applicant's own view of their application: where it stands, the reference and dates, the documents they sent, and the reasons for any rejection, which are private to them
 * (the reviewer's internal notes are never part of this data). A rejected application offers Edit & Reapply. */
export function ApplicationStatusCard({ application: a, compact, onReapply }: { application: ApplicationStatus; compact?: boolean; onReapply?: () => void }) {
  const s = STAGE[a.stage];
  const lastSubmitted = [...a.timeline].reverse().find((t) => t.type === "SUBMITTED" || t.type === "RESUBMITTED")?.at ?? a.submittedAt;
  // Earlier rejections (kept for reference): all of them once it is back under review, or all but the current one while it is rejected.
  const earlier = a.stage === "REJECTED" ? a.rejections.slice(0, -1) : a.rejections;
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
        {trackerSteps(a.stage).map((st) => (
          <li key={st.label} className={`adv-step is-${st.state}`} aria-current={st.state === "current" ? "step" : undefined}>
            <span className="adv-step-dot" aria-hidden="true">{st.state === "done" ? <RuwadIcon name="check" size={12} /> : st.state === "bad" ? "!" : ""}</span>
            <span>{st.label}</span>
          </li>
        ))}
      </ol>

      <dl className="adv-appstatus-dates">
        {lastSubmitted && <div><dt>{a.attempts > 1 ? "Resubmitted" : "Submitted"}</dt><dd>{formatWhen(lastSubmitted)}</dd></div>}
        {a.attempts > 1 && <div><dt>Submission</dt><dd>{a.attempts}</dd></div>}
        {a.decidedAt && <div><dt>{a.stage === "REJECTED" ? "Decision" : "Updated"}</dt><dd>{formatWhen(a.decidedAt)}</dd></div>}
      </dl>

      {a.stage === "REJECTED" && a.rejectionReason && (
        <div className="adv-reason" role="note">
          <b>Reason from the RUWĀD team</b>
          <p>{a.rejectionReason}</p>
          <span className="muted small"><RuwadIcon name="lock" size={12} /> Only you can see this.</span>
        </div>
      )}

      {a.canReapply && onReapply && (
        <div className="adv-review-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <button type="button" className="btn btn-primary" onClick={onReapply}><RuwadIcon name="edit" size={14} /> Edit &amp; Reapply</button>
        </div>
      )}

      {!compact && earlier.length > 0 && (
        <div className="adv-earlier">
          <b>{a.stage === "REJECTED" ? "Earlier decisions" : "Previous rejection"}</b>
          <ul>
            {earlier.map((r, i) => <li key={`${r.at}-${i}`}><span className="muted small">{formatWhen(r.at)}</span><p>{r.reason ?? "No reason was recorded."}</p></li>)}
          </ul>
          <span className="muted small"><RuwadIcon name="lock" size={12} /> Kept for your reference. Only you can see this.</span>
        </div>
      )}

      {!compact && a.documents.length > 0 && (
        <div className="adv-appdocs">
          <b>Documents on file</b>
          <ul>
            {a.documents.map((d) => <li key={d.id}><span className="adv-filename">{d.fileName}</span><span className="muted adv-filesize">{d.kind === "CV" ? "CV" : d.kind === "PHOTO" ? "Photograph" : "Certificate"} · {formatBytes(d.size)}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
