"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession, useMyStartupId } from "@/hooks/use-store";
import { fetchStartupBySlug, fetchStartupEditPayload, saveStartupEdit } from "@/lib/api/startups";
import { ApiError } from "@/lib/api/client";
import { startupSchema } from "@/features/submissions/schemas/startup";
import { relaxForEdit } from "@/features/submissions/edit-schema";
import { validateStep } from "@/features/submissions/validate";
import { SubmissionSection } from "@/features/submissions/SubmissionSection";
import { CompactLogoUploader } from "@/features/submissions/CompactLogoUploader";

type Payload = Record<string, unknown>;
const NO_AI_FIELDS = new Set<string>();

/** Edit an already-live startup in place. Same form as the submission, relaxed so only the core identity fields are required; saving applies the
 * change immediately (no re-review), rescores the startup and refreshes the experimental ML estimate from whatever information is on file. */
export function EditStartupPage() {
  const { loggedIn, hydrated } = useSession();
  const startupSlug = useMyStartupId();
  const router = useRouter();
  const toast = useToast();
  const schema = useMemo(() => relaxForEdit(startupSchema), []);

  // The profile is fetched fresh every time this page opens (never cached), so an edit always starts from what is live now.
  const [loaded, setLoaded] = useState<{ entityId: string; payload: Payload } | null>(null);
  const [edited, setEdited] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !loggedIn) return;
    if (!startupSlug || started.current === startupSlug) return;
    started.current = startupSlug;
    (async () => {
      try {
        const s = await fetchStartupBySlug(startupSlug);
        if (!s?.entityId) throw new Error("This company has no editable profile yet.");
        setLoaded({ entityId: s.entityId, payload: await fetchStartupEditPayload(s.entityId) });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load your company profile.");
      }
    })();
  }, [hydrated, loggedIn, startupSlug]);

  const entityId = loaded?.entityId ?? null;
  const payload = edited ?? loaded?.payload ?? {};
  const loading = !!startupSlug && !loaded && !loadError;
  const dirty = edited !== null;

  // Leaving with unsaved changes is the one way to lose work here; the browser's own prompt is enough.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate />;

  const header = <IntelligencePageHeader title="Edit Startup" description="Update your live profile. Changes go live immediately and your RUWĀD Score and ML estimate are recalculated from what is on file." />;
  if (loading) return <div>{header}<div className="mt-20"><EmptyState icon="mystartup" title="Loading your company profile…" body="" /></div></div>;
  if (loadError) return <div>{header}<div className="mt-20"><EmptyState icon="help" title="Couldn't load your company profile" body={loadError} /></div></div>;
  if (!entityId) return <div>{header}<div className="mt-20"><EmptyState icon="mystartup" title="No company linked to your account yet" body="Once your company profile is submitted and approved, you can edit it here." /></div></div>;

  const step = schema.steps[stepIndex];
  const validation = validateStep(step, payload);
  const allValid = schema.steps.every((st) => validateStep(st, payload).valid);

  function updateField(name: string, value: unknown) {
    setEdited({ ...payload, [name]: value });
  }

  async function save() {
    if (!allValid) {
      setShowErrors(true);
      const bad = schema.steps.findIndex((st) => !validateStep(st, payload).valid);
      if (bad >= 0) setStepIndex(bad);
      toast("Some fields need attention before you can save.");
      return;
    }
    setSaving(true);
    try {
      const result = await saveStartupEdit(entityId!, payload);
      setEdited(null);
      toast(result.lockedFields.length
        ? `Saved. ${result.lockedFields.length} value${result.lockedFields.length === 1 ? " is" : "s are"} verified by RUWĀD and was not changed.`
        : "Saved. Your RUWĀD Score and ML estimate are being updated.");
      router.push("/workspace/startup");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save your changes — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {header}
      <div className="form-shell mt-20">
        <div className="form-steps">
          {schema.steps.map((st, i) => (
            <button key={st.id} type="button" className={`step-item${i === stepIndex ? " active" : ""}${showErrors && !validateStep(st, payload).valid ? " error" : ""}`} onClick={() => setStepIndex(i)}>
              <span className="si-dot">{i + 1}</span>
              {st.label}
            </button>
          ))}
        </div>
        <div className="form-main">
          <div className="form-main-head">
            <div>
              <h2>{step.label}</h2>
              <div className="fmh-sub">Editing your live profile</div>
            </div>
            <span className="autosave-badge">{dirty ? "Unsaved changes" : "No changes yet"}</span>
          </div>
          {stepIndex === 0 && <CompactLogoUploader value={payload.logoImageId as string | undefined} onChange={(v) => updateField("logoImageId", v)} />}
          {step.sections.map((section, si) => {
            const fields = stepIndex === 0 ? section.fields.filter((f) => f.type !== "image-upload") : section.fields;
            if (fields.length === 0) return null;
            return (
              <SubmissionSection
                key={si}
                section={{ ...section, fields }}
                payload={payload}
                showErrors={showErrors}
                fieldErrors={validation.fieldErrors}
                repeaterErrors={validation.repeaterErrors}
                aiFilledFields={NO_AI_FIELDS}
                onFieldChange={updateField}
              />
            );
          })}
        </div>
      </div>
      <div className="form-sticky-actions">
        <div className="flex gap-8">
          <button type="button" className="btn btn-outline" onClick={() => router.push("/workspace/startup")}>Cancel</button>
        </div>
        <div className="flex gap-8">
          <button type="button" className="btn btn-outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>Previous</button>
          {stepIndex < schema.steps.length - 1 && <button type="button" className="btn btn-outline" onClick={() => setStepIndex((i) => i + 1)}>Next</button>}
          <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
