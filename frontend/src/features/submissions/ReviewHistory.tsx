import { RuwadIcon } from "@/components/icons/ruwad-icon";
import type { ApiSubmissionReviewEvent } from "@/lib/api/types";

const EVENT_LABEL: Record<ApiSubmissionReviewEvent["eventType"], string> = {
  DRAFT_CREATED: "Draft created",
  SUBMITTED: "Submitted for review",
  REVIEW_STARTED: "Review started",
  CHANGES_REQUESTED: "Changes requested",
  RESUBMITTED: "Resubmitted",
  APPROVED: "Approved & published",
  REJECTED: "Not approved",
};

export function ReviewHistory({ events }: { events: ApiSubmissionReviewEvent[] }) {
  if (!events.length) return <p className="small muted">No review history yet.</p>;
  return (
    <div>
      {events.map((e) => (
        <div key={e.id} className="flex gap-8 mb-12" style={{ alignItems: "flex-start" }}>
          <RuwadIcon name="clock" size={14} />
          <div>
            <div className="small" style={{ fontWeight: 600 }}>{EVENT_LABEL[e.eventType]}</div>
            <div className="small muted">{new Date(e.createdAt).toLocaleString()}</div>
            {e.message && <p className="small mt-4">{e.message}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
