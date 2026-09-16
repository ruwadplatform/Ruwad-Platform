import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { SubmissionSidebar } from "./SubmissionSidebar";
import type { EntitySchema } from "./schema-types";

type Payload = Record<string, unknown>;
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** The .form-shell grid shell — sidebar (sticky while scrolling, see
 * forms.css) + main content region (heading, subtitle, save-status badge,
 * then whatever the current step renders as children). Extracted from
 * SubmissionWizard's inline JSX, same CSS, no behavior change. */
export function SubmissionLayout({
  schema, payload, stepIndex, touchedSteps, isReviewStep, onGoToStep, saveStatus, children,
}: {
  schema: EntitySchema;
  payload: Payload;
  stepIndex: number;
  touchedSteps: Set<number>;
  isReviewStep: boolean;
  onGoToStep: (i: number) => void;
  saveStatus: SaveStatus;
  children: React.ReactNode;
}) {
  const currentStep = schema.steps[stepIndex];
  return (
    <div className="form-shell">
      <SubmissionSidebar
        schema={schema}
        payload={payload}
        stepIndex={stepIndex}
        touchedSteps={touchedSteps}
        isReviewStep={isReviewStep}
        onGoToStep={onGoToStep}
      />
      <div className="form-main">
        <div className="form-main-head">
          <div>
            <h2>{isReviewStep ? "Review & Submit" : currentStep?.label}</h2>
            <div className="fmh-sub">{schema.label} submission</div>
          </div>
          <SaveBadge status={saveStatus} />
        </div>
        {children}
      </div>
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "saving") return <span className="autosave-badge"><RuwadIcon name="clock" size={13} /> Saving…</span>;
  if (status === "saved") return <span className="autosave-badge"><RuwadIcon name="check" size={13} /> Saved</span>;
  if (status === "error") return <span className="autosave-badge" style={{ color: "var(--crit)" }}><RuwadIcon name="help" size={13} /> Save failed — retrying</span>;
  return <span className="autosave-badge"><RuwadIcon name="cloud" size={13} /> Autosaves as you go</span>;
}
