"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shell/ToastProvider";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { createDraftSubmission, saveSubmissionDraft, submitSubmissionForReview, deleteDraftSubmission } from "@/lib/store";
import { fetchMySubmissions } from "@/lib/api/submissions";
import { ApiError } from "@/lib/api/client";
import type { ApiSubmission, ApiSubmissionKind } from "@/lib/api/types";
import { SCHEMAS } from "./schemas";
import { Field, type FieldValue } from "./Field";
import { Repeater } from "./Repeater";
import { validateStep, validateSchema, completionPercentage } from "./validate";
import type { EntitySchema, StepDef } from "./schema-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Payload = Record<string, unknown>;

const AUTOSAVE_DELAY_MS = 1500;

export function SubmissionWizard({ kind }: { kind: ApiSubmissionKind }) {
  const { loggedIn, hydrated } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const schema = SCHEMAS[kind];

  const [submission, setSubmission] = useState<ApiSubmission | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [touchedSteps, setTouchedSteps] = useState<Set<number>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ApiSubmission | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const initStarted = useRef(false);

  // Resolve-or-create the draft once the session is known. Guarded by
  // initStarted (not just the `submission` state check) because React
  // StrictMode's dev-only double-invoke would otherwise race two concurrent
  // createDraftSubmission() calls before either sees the other's result,
  // producing two orphaned drafts. Deliberately no `cancelled`-flag cleanup
  // here: initStarted already guarantees this async chain only ever runs
  // once per mount, so StrictMode's synthetic cleanup must not be allowed to
  // discard its result — doing so left the wizard stuck on "Starting your
  // submission…" forever even though the draft was created successfully.
  useEffect(() => {
    if (!hydrated || !loggedIn || submission || initStarted.current) return;
    initStarted.current = true;
    (async () => {
      try {
        const mine = await fetchMySubmissions();
        const existing = mine.find((x) => x.kind === kind && (x.status === "DRAFT" || x.status === "CHANGES_REQUESTED")) ?? null;
        const s = existing ?? (await createDraftSubmission(kind));
        setSubmission(s);
        setPayload(s.payload ?? {});
        const stepIdx = schema.steps.findIndex((st) => st.id === s.currentStep);
        setStepIndex(stepIdx >= 0 ? stepIdx : 0);
      } catch (e) {
        setInitError(e instanceof ApiError ? e.message : "Couldn't start your submission.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loggedIn, kind]);

  const persist = useCallback((nextPayload: Payload, stepId: string, silent = false) => {
    if (!submission) return;
    if (!silent) setSaveStatus("saving");
    saveSubmissionDraft(submission.id, {
      payload: nextPayload,
      currentStep: stepId,
      completionPercentage: completionPercentage(schema, nextPayload),
    })
      .then((saved) => { setSubmission(saved); setSaveStatus("saved"); dirtyRef.current = false; })
      .catch(() => setSaveStatus("error"));
  }, [submission, schema]);

  // Debounced autosave on payload edits.
  useEffect(() => {
    if (!submission || !dirtyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist(payload, schema.steps[stepIndex]?.id ?? "review", true);
    }, AUTOSAVE_DELAY_MS);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  function updateField(name: string, value: unknown) {
    dirtyRef.current = true;
    setSaveStatus("idle");
    setPayload((p) => ({ ...p, [name]: value }));
  }

  const isReviewStep = stepIndex === schema.steps.length;
  const currentStep: StepDef | undefined = schema.steps[stepIndex];
  const stepValidation = currentStep ? validateStep(currentStep, payload) : { fieldErrors: {}, repeaterErrors: {}, valid: true };
  const showErrors = touchedSteps.has(stepIndex);

  function goNext() {
    if (!currentStep) return;
    setTouchedSteps((s) => new Set(s).add(stepIndex));
    if (!stepValidation.valid) return;
    if (submission) persist(payload, schema.steps[stepIndex + 1]?.id ?? "review");
    setStepIndex((i) => i + 1);
  }
  function goPrev() {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
  }
  function goToStep(i: number) {
    if (i > stepIndex && currentStep) {
      setTouchedSteps((s) => new Set(s).add(stepIndex));
      if (!stepValidation.valid) return;
    }
    if (submission) persist(payload, schema.steps[i]?.id ?? "review");
    setStepIndex(i);
  }
  function saveDraftNow() {
    if (submission) persist(payload, currentStep?.id ?? "review");
  }
  function deleteThisDraft() {
    if (!submission) return;
    openModal(
      <ConfirmModal
        title="Delete this draft?"
        body="This cannot be undone."
        confirmLabel="Delete Draft"
        danger
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteDraftSubmission(submission.id);
          closeModal();
          toast("Draft deleted");
          router.push("/submit");
        }}
      />,
    );
  }

  async function handleSubmit() {
    if (!submission) return;
    const allValid = validateSchema(schema, payload);
    if (!allValid || !confirmChecked) return;
    setSubmitting(true);
    try {
      await saveSubmissionDraft(submission.id, { payload, currentStep: "review", completionPercentage: 100 });
      const result = await submitSubmissionForReview(submission.id);
      setDone(result);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't submit — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hydrated) return null;
  if (!loggedIn) return <WorkspaceGate title="Sign in to submit a listing" body="Create a free account or sign in to submit your organization for review." />;
  if (initError) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load your submission" body={initError} /></div>;
  if (!submission) {
    return <div className="mt-20"><EmptyState icon={schema.icon as RuwadIconName} title="Starting your submission…" body="" /></div>;
  }

  if (done) return <SubmissionConfirmation submission={done} schema={schema} />;

  return (
    <div>
      {submission.status === "CHANGES_REQUESTED" && submission.reviewerNote && (
        <div className="panel panel-pad mt-16 mb-16" style={{ borderColor: "var(--warn)", background: "var(--warn-tint)" }}>
          <div className="flex gap-8" style={{ alignItems: "flex-start" }}>
            <RuwadIcon name="help" size={16} />
            <div>
              <b className="small">Changes requested by the RUWĀD review team</b>
              <p className="small mt-4">{submission.reviewerNote}</p>
            </div>
          </div>
        </div>
      )}

      <div className="form-shell">
        <div className="form-steps">
          <div className="form-progress">
            <div className="fp-num">{completionPercentage(schema, payload)}%</div>
            <div className="fp-label">Complete</div>
            <div className="form-progress-track"><div className="form-progress-fill" style={{ width: `${completionPercentage(schema, payload)}%` }} /></div>
          </div>
          {schema.steps.map((step, i) => {
            const stepErrs = validateStep(step, payload);
            const stepDone = stepErrs.valid && touchedSteps.has(i);
            return (
              <button key={step.id} type="button" className={`step-item${i === stepIndex ? " active" : ""}${stepDone ? " done" : ""}`} onClick={() => goToStep(i)}>
                <span className="si-dot">{stepDone ? <RuwadIcon name="check" size={11} /> : i + 1}</span>
                {step.label}
              </button>
            );
          })}
          <button type="button" className={`step-item${isReviewStep ? " active" : ""}`} onClick={() => goToStep(schema.steps.length)}>
            <span className="si-dot">{schema.steps.length + 1}</span>
            Review & Submit
          </button>
        </div>

        <div className="form-main">
          <div className="form-main-head">
            <div>
              <h2>{isReviewStep ? "Review & Submit" : currentStep!.label}</h2>
              <div className="fmh-sub">{schema.label} submission</div>
            </div>
            <SaveBadge status={saveStatus} />
          </div>

          {!isReviewStep && currentStep && (
            <div>
              {currentStep.sections.map((section, si) => (
                <div className="form-section-block" key={si}>
                  {section.title && <h4>{section.title}</h4>}
                  <div className="grid-2">
                    {section.fields.map((f) => {
                      if (f.condition && !f.condition(payload)) return null;
                      if (f.type === "repeater") {
                        return (
                          <div key={f.name} className="field-full">
                            <Repeater
                              field={f}
                              items={Array.isArray(payload[f.name]) ? (payload[f.name] as Payload[]) : []}
                              errors={showErrors ? stepValidation.repeaterErrors[f.name] : undefined}
                              onChange={(items) => updateField(f.name, items)}
                            />
                          </div>
                        );
                      }
                      return (
                        <Field
                          key={f.name}
                          field={f}
                          value={payload[f.name] as FieldValue}
                          error={showErrors ? stepValidation.fieldErrors[f.name] : undefined}
                          onChange={(v) => updateField(f.name, v)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isReviewStep && (
            <ReviewPanel
              schema={schema}
              payload={payload}
              onEditSection={(i) => setStepIndex(i)}
              confirmChecked={confirmChecked}
              onConfirmChange={setConfirmChecked}
            />
          )}
        </div>
      </div>

      <div className="form-sticky-actions">
        <div className="flex gap-8">
          <button type="button" className="btn btn-outline" onClick={goPrev} disabled={stepIndex === 0}>Previous</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={deleteThisDraft}><RuwadIcon name="trash" size={13} /> Delete Draft</button>
        </div>
        <div className="flex gap-8">
          <button type="button" className="btn btn-outline" onClick={saveDraftNow}>Save Draft</button>
          {isReviewStep ? (
            <button type="button" className="btn btn-primary" disabled={!confirmChecked || submitting || !validateSchema(schema, payload)} onClick={handleSubmit}>
              {submitting ? "Submitting…" : "Submit for Review"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={goNext}>Next</button>
          )}
        </div>
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

function ReviewPanel({ schema, payload, onEditSection, confirmChecked, onConfirmChange }: {
  schema: EntitySchema;
  payload: Payload;
  onEditSection: (stepIndex: number) => void;
  confirmChecked: boolean;
  onConfirmChange: (v: boolean) => void;
}) {
  return (
    <div>
      {schema.steps.map((step, i) => {
        const v = validateStep(step, payload);
        return (
          <div className="form-section-block" key={step.id}>
            <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ border: "none", marginBottom: 0, paddingBottom: 0 }}>{step.label}</h4>
              <div className="flex gap-8" style={{ alignItems: "center" }}>
                <span className={`badge ${v.valid ? "badge-good" : "badge-warn"}`}>{v.valid ? "Complete" : "Missing fields"}</span>
                <button type="button" className="btn btn-outline btn-xs" onClick={() => onEditSection(i)}>Edit</button>
              </div>
            </div>
          </div>
        );
      })}
      <div className="field mt-16">
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 500 }}>
          <input type="checkbox" checked={confirmChecked} onChange={(e) => onConfirmChange(e.target.checked)} style={{ marginTop: 2 }} />
          I confirm that the information provided is accurate and I am authorized to submit this listing.
        </label>
      </div>
    </div>
  );
}

function SubmissionConfirmation({ submission, schema }: { submission: ApiSubmission; schema: EntitySchema }) {
  const router = useRouter();
  return (
    <div className="mt-20">
      <div className="panel panel-pad" style={{ textAlign: "center", padding: "40px 24px" }}>
        <RuwadIcon name="check" size={36} />
        <h2 className="mt-16">Submitted for review</h2>
        <p className="muted small mt-8">
          Your {schema.label.toLowerCase()} submission has been sent to the RUWĀD review team.
        </p>
        <div className="stat-mini-row mt-20" style={{ maxWidth: 420, margin: "20px auto 0" }}>
          <div className="stat-mini"><div className="sm-label">Reference</div><div className="sm-val fs-15">{submission.id.slice(0, 8).toUpperCase()}</div></div>
          <div className="stat-mini"><div className="sm-label">Status</div><div className="sm-val fs-15">Submitted</div></div>
        </div>
        <div className="flex gap-8 mt-20" style={{ justifyContent: "center" }}>
          <button className="btn btn-outline" onClick={() => router.push("/workspace")}>Back to Workspace</button>
          <button className="btn btn-primary" onClick={() => router.push("/workspace")}>View Submission</button>
        </div>
      </div>
    </div>
  );
}
