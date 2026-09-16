import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { validateStep, completionPercentage } from "./validate";
import { SubmissionProgress } from "./SubmissionProgress";
import type { EntitySchema } from "./schema-types";

type Payload = Record<string, unknown>;

/** The left sidebar — extracted from SubmissionWizard's inline .form-steps
 * JSX, same markup/CSS, plus one addition: a step can now render as
 * current / completed / incomplete / error (four states) instead of the
 * previous three (active / done / default-for-everything-else). A step
 * that's been visited (touchedSteps) but still fails validation used to
 * fall back to the same plain look as a step nobody has opened yet —
 * indistinguishable from "not yet visited". */
export function SubmissionSidebar({ schema, payload, stepIndex, touchedSteps, isReviewStep, onGoToStep }: {
  schema: EntitySchema;
  payload: Payload;
  stepIndex: number;
  touchedSteps: Set<number>;
  isReviewStep: boolean;
  onGoToStep: (i: number) => void;
}) {
  return (
    <div className="form-steps">
      <SubmissionProgress percent={completionPercentage(schema, payload)} />
      {schema.steps.map((step, i) => {
        const stepErrs = validateStep(step, payload);
        const visited = touchedSteps.has(i);
        const done = stepErrs.valid && visited;
        const error = visited && !stepErrs.valid;
        const cls = `step-item${i === stepIndex ? " active" : ""}${done ? " done" : ""}${error ? " error" : ""}`;
        return (
          <button key={step.id} type="button" className={cls} onClick={() => onGoToStep(i)}>
            <span className="si-dot">{done ? <RuwadIcon name="check" size={11} /> : error ? <RuwadIcon name="help" size={11} /> : i + 1}</span>
            {step.label}
          </button>
        );
      })}
      <button type="button" className={`step-item${isReviewStep ? " active" : ""}`} onClick={() => onGoToStep(schema.steps.length)}>
        <span className="si-dot">{schema.steps.length + 1}</span>
        Review & Submit
      </button>
    </div>
  );
}
