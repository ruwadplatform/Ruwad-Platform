"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { schemaFor } from "./schemas";
import { adaptHubExtraction, hubKeysRemovedByTypeChange, isHubType, normalizeHubPayload, pruneHiddenHubFields } from "./schemas/hub";
import { validateStep, validateSchema, completionPercentage } from "./validate";
import { allFields } from "./schema-types";
import type { EntitySchema } from "./schema-types";
import { SubmissionLayout } from "./SubmissionLayout";
import { SubmissionSection } from "./SubmissionSection";
import { StickyFormActions } from "./StickyFormActions";
import { ReviewSection } from "./ReviewSection";
import { AIAutofillCard } from "./AIAutofillCard";
import { CompactLogoUploader } from "./CompactLogoUploader";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Payload = Record<string, unknown>;

const AUTOSAVE_DELAY_MS = 1500;

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function withRemovals(payload: Payload, removed: Set<string>): Payload {
  const out: Payload = { ...payload };
  removed.forEach((k) => { if (!(k in out)) out[k] = null; });
  return out;
}

export function SubmissionWizard({ kind }: { kind: ApiSubmissionKind }) {
  const { loggedIn, hydrated } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [submission, setSubmission] = useState<ApiSubmission | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  // Hub / Enabler steps depend on the selected Type; every other kind is static.
  const typeValue = payload.type;
  const schema = useMemo(() => schemaFor(kind, { type: typeValue }), [kind, typeValue]);
  const [stepIndex, setStepIndex] = useState(0);
  const [touchedSteps, setTouchedSteps] = useState<Set<number>>(new Set());
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ApiSubmission | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Keys removed locally (type change / hidden answers). The server merges
  // payloads shallowly, so a removal is sent as an explicit null or it would
  // come back on the next load.
  const removedRef = useRef<Set<string>>(new Set());
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
        // Nulls are removals from an earlier type change — drop them; and map
        // older hub drafts (free-text funding) onto the current fields.
        const loaded = Object.fromEntries(Object.entries(s.payload ?? {}).filter(([, v]) => v !== null));
        const initial = kind === "HUB" ? normalizeHubPayload(loaded) : loaded;
        setPayload(initial);
        const stepIdx = schemaFor(kind, initial).steps.findIndex((st) => st.id === s.currentStep);
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
    const sentRemovals = new Set(removedRef.current);
    saveSubmissionDraft(submission.id, {
      payload: withRemovals(nextPayload, sentRemovals),
      currentStep: stepId,
      completionPercentage: completionPercentage(schema, nextPayload),
    })
      .then((saved) => { setSubmission(saved); setSaveStatus("saved"); dirtyRef.current = false; sentRemovals.forEach((k) => removedRef.current.delete(k)); })
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

  /** Applies a new payload, dropping answers hidden by their controlling
   * question (Hub forms only) and remembering what was dropped. */
  function commit(next: Payload): Payload {
    if (kind !== "HUB") return next;
    const { payload: cleaned, removed } = pruneHiddenHubFields(next);
    removed.forEach((k) => removedRef.current.add(k));
    return cleaned;
  }

  function changeType(newType: string) {
    dirtyRef.current = true;
    setSaveStatus("idle");
    setTouchedSteps(new Set());
    setStepIndex(0); // the Type field lives on the first step
    setPayload((p) => {
      const drop = hubKeysRemovedByTypeChange(p.type, newType);
      const next: Payload = { ...p, type: newType };
      for (const k of drop) if (k in next) { delete next[k]; removedRef.current.add(k); }
      return commit(next);
    });
  }

  function requestTypeChange(newType: string) {
    const old = payload.type;
    if (newType === old) return;
    const holdsData = isHubType(old) && hubKeysRemovedByTypeChange(old, newType).some((k) => {
      const v = payload[k];
      return !(isEmptyValue(v) || v === false);
    });
    if (!holdsData) { changeType(newType); return; }
    openModal(
      <ConfirmModal
        title="Change organization type?"
        body="Changing the organization type may remove information entered in type-specific sections. Do you want to continue?"
        confirmLabel="Change Type"
        onCancel={closeModal}
        onConfirm={() => { changeType(newType); closeModal(); }}
      />,
    );
  }

  function updateField(name: string, value: unknown) {
    if (kind === "HUB" && name === "type") { requestTypeChange(String(value ?? "")); return; }
    dirtyRef.current = true;
    setSaveStatus("idle");
    setTouchedFields((s) => new Set(s).add(name));
    // A manual edit is the user overriding whatever AI put there — the
    // "AI filled" badge is only meaningful until the user has looked at
    // and touched that field.
    setAiFilledFields((s) => { if (!s.has(name)) return s; const next = new Set(s); next.delete(name); return next; });
    setPayload((p) => commit({ ...p, [name]: value }));
  }

  /** Called by AIAutofillCard once a document has been analyzed. Never
   * writes anywhere but `payload` — the same setPayload → debounced
   * persist() → PATCH /api/submissions/:id path every manual edit already
   * goes through, so AI-extracted values get exactly the same validation
   * as manual entry, with no separate code path. A field the user has
   * already edited (and is non-empty) is never silently overwritten —
   * conflicts route through the existing ConfirmModal instead. */
  function applyAiAutofill(rawExtracted: Record<string, unknown>) {
    // For hubs, fit the extraction to the form first (canonical Type, only
    // fields that exist for that type).
    const extracted = kind === "HUB" ? adaptHubExtraction(rawExtracted, payload) : rawExtracted;
    const safe: Record<string, unknown> = {};
    const conflictingNames: string[] = [];
    for (const [name, value] of Object.entries(extracted)) {
      if (touchedFields.has(name) && !isEmptyValue(payload[name])) {
        conflictingNames.push(name);
      } else {
        safe[name] = value;
      }
    }

    const merge = (fields: Record<string, unknown>) => {
      if (Object.keys(fields).length === 0) return;
      dirtyRef.current = true;
      setSaveStatus("idle");
      setAiFilledFields((s) => new Set([...s, ...Object.keys(fields)]));
      setPayload((p) => commit({ ...p, ...fields }));
    };

    if (conflictingNames.length === 0) {
      merge(safe);
      return;
    }

    const labels = allFields(schema).filter((f) => conflictingNames.includes(f.name)).map((f) => f.label);
    openModal(
      <ConfirmModal
        title="Some fields you've already edited"
        body={`The document also has values for: ${labels.join(", ")}. Click Cancel to keep your own edits for those fields, or Overwrite to replace them with the AI-extracted values. Every other extracted field will be filled in either way.`}
        confirmLabel="Overwrite with AI Values"
        onCancel={() => { merge(safe); closeModal(); }}
        onConfirm={() => { merge({ ...safe, ...Object.fromEntries(conflictingNames.map((n) => [n, extracted[n]])) }); closeModal(); }}
      />,
    );
  }

  const isReviewStep = stepIndex === schema.steps.length;
  const currentStep = schema.steps[stepIndex];
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
      await saveSubmissionDraft(submission.id, { payload: withRemovals(payload, removedRef.current), currentStep: "review", completionPercentage: 100 });
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

      <SubmissionLayout schema={schema} payload={payload} stepIndex={stepIndex} touchedSteps={touchedSteps} isReviewStep={isReviewStep} onGoToStep={goToStep} saveStatus={saveStatus}>
        {!isReviewStep && currentStep && (
          <div>
            {stepIndex === 0 && (
              <>
                <AIAutofillCard kind={kind} submissionId={submission.id} onExtracted={applyAiAutofill} />
                <CompactLogoUploader value={payload.logoImageId as string | undefined} onChange={(v) => updateField("logoImageId", v)} />
              </>
            )}
            {currentStep.sections.map((section, si) => {
              // The logo field is already rendered by CompactLogoUploader
              // above on step 0 — never render it twice.
              const fields = stepIndex === 0 ? section.fields.filter((f) => f.type !== "image-upload") : section.fields;
              if (fields.length === 0) return null;
              return (
                <SubmissionSection
                  key={si}
                  section={{ ...section, fields }}
                  payload={payload}
                  showErrors={showErrors}
                  fieldErrors={stepValidation.fieldErrors}
                  repeaterErrors={stepValidation.repeaterErrors}
                  aiFilledFields={aiFilledFields}
                  onFieldChange={updateField}
                />
              );
            })}
          </div>
        )}

        {isReviewStep && (
          <ReviewSection
            schema={schema}
            payload={payload}
            hideEmpty={kind === "HUB"}
            onEditSection={(i) => setStepIndex(i)}
            confirmChecked={confirmChecked}
            onConfirmChange={setConfirmChecked}
          />
        )}
      </SubmissionLayout>

      <StickyFormActions
        onPrev={goPrev}
        prevDisabled={stepIndex === 0}
        onDeleteDraft={deleteThisDraft}
        onSaveDraft={saveDraftNow}
        isReviewStep={isReviewStep}
        canSubmit={confirmChecked && validateSchema(schema, payload)}
        submitting={submitting}
        onNext={goNext}
        onSubmit={handleSubmit}
      />
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
