"use client";

import { useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { autofillSubmission, checkPitchDeck, type AutofillMeta } from "@/lib/api/submission-autofill";
import { ApiError } from "@/lib/api/client";
import type { ApiSubmissionKind } from "@/lib/api/types";

interface AutofillCopy {
  title: string;
  uploadLabel: string;
  description: string;
  extracts: string[];
}

/** Per-kind copy for the card — exact wording per the product spec. Every kind accepts PDF or PPTX, up to 100 MB. */
const AI_AUTOFILL_COPY: Record<ApiSubmissionKind, AutofillCopy> = {
  STARTUP: {
    title: "Submit Your Pitch",
    uploadLabel: "Upload Pitch Deck",
    description: "Upload your pitch deck and let AI extract key information to fill this form automatically.",
    extracts: ["Extracts company details", "Fills product, market & funding info", "Saves you time", "You can review and edit any field"],
  },
  INVESTOR: {
    title: "Submit Your Investment Profile",
    uploadLabel: "Upload Fund Deck",
    description: "Upload your fund deck or investment profile and let AI prefill your firm information.",
    extracts: ["Extracts firm details & thesis", "Fills focus, ticket size & geography", "Saves you time", "You can review and edit any field"],
  },
  HUB: {
    title: "Submit Your Program",
    uploadLabel: "Upload Program Deck",
    description: "Upload your program deck or brochure and let AI prefill your organization and program information.",
    extracts: ["Extracts organization & program details", "Fills services, focus & eligibility", "Saves you time", "You can review and edit any field"],
  },
  RESEARCH: {
    title: "Submit Your Institution",
    uploadLabel: "Upload Institutional Profile",
    description: "Upload an institutional profile or brochure and let AI prefill your research profile.",
    extracts: ["Extracts institution details", "Fills departments, labs & research areas", "Saves you time", "You can review and edit any field"],
  },
  MULTINATIONAL: {
    title: "Submit Your Company Profile",
    uploadLabel: "Upload Corporate Profile",
    description: "Upload your corporate profile or presentation and let AI prefill your company information.",
    extracts: ["Extracts company details", "Fills divisions, products & presence", "Saves you time", "You can review and edit any field"],
  },
};

type UploadState = "idle" | "uploading" | "extracting" | "analyzing" | "populating" | "done" | "error";
const BUSY: UploadState[] = ["uploading", "extracting", "analyzing", "populating"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AutofillSummary { filled: number; kept: number }

/** The prominent AI-autofill upload card at the top of every submission
 * form, built on the pre-existing "Smart Pitch Deck Upload" CSS
 * (.ai-upload-panel-lg/.ai-upload-icon/.ai-upload-spinner/.chip-ai — see
 * forms.css) that had no component using it until now. Never persists or
 * submits anything itself — it only hands extracted fields back to the
 * parent via onExtracted; SubmissionWizard.applyAiAutofill() decides how
 * (and whether) they get merged into the payload. */
export function AIAutofillCard({ kind, submissionId, onExtracted }: {
  kind: ApiSubmissionKind;
  submissionId: string;
  onExtracted: (fields: Record<string, unknown>) => AutofillSummary;
}) {
  const copy = AI_AUTOFILL_COPY[kind];
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AutofillSummary>({ filled: 0, kept: 0 });
  const [meta, setMeta] = useState<AutofillMeta | null>(null);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = BUSY.includes(state);
  const profileWord = kind === "STARTUP" ? "startup profile" : "profile";

  async function handleFile(picked: File | undefined) {
    if (!picked || busy) return; // one upload at a time
    setError(null);
    const check = await checkPitchDeck(picked);
    if (!check.ok) {
      setState("error");
      setError(check.message);
      return;
    }
    setFileName(check.file.name);
    setProgress(0);
    setMeta(null);
    setState("uploading");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await autofillSubmission(submissionId, check.file, {
        onUploadProgress: setProgress,
        // The server reads the text, then asks the AI — show that as it happens (the request is one round trip).
        onUploaded: () => { setState("extracting"); timer = setTimeout(() => setState((s) => (s === "extracting" ? "analyzing" : s)), 2500); },
      });
      clearTimeout(timer);
      setState("populating");
      await wait(350);
      const applied = onExtracted(result.fields);
      setSummary(applied);
      setMeta(result.meta);
      setState("done");
    } catch (e) {
      clearTimeout(timer);
      setState("error");
      setError(e instanceof ApiError ? e.message : "Unable to analyze the pitch deck.");
    }
  }

  function reset() {
    setState("idle");
    setFileName(null);
    setError(null);
    setSummary({ filled: 0, kept: 0 });
    setMeta(null);
    setProgress(0);
  }

  return (
    <div
      className={`ai-upload-panel-lg${drag ? " drag" : ""}${state === "error" ? " ai-error" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFile(e.dataTransfer.files?.[0]); }}
    >
      <input
        ref={inputRef} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" style={{ display: "none" }}
        onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />

      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div className="flex gap-8" style={{ alignItems: "center" }}>
          <RuwadIcon name="sparkle" size={18} />
          <b className="fs-15">{copy.title}</b>
          <span className="chip-ai">AI-Powered Autofill</span>
        </div>
      </div>
      <p className="muted fs-13 mt-4">{copy.description}</p>

      <div className="flex" style={{ gap: 20, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <div
          className={`ai-upload-dropzone${state === "analyzing" ? " analyzing" : ""}`}
          style={{ flex: "1 1 260px", cursor: busy ? "default" : "pointer" }}
          aria-busy={busy}
          onClick={() => !busy && inputRef.current?.click()}
        >
          {busy ? (
            <>
              <div className="ai-upload-spinner" />
              <div className="ai-upload-text" role="status">
                <b>
                  {state === "uploading" ? `Uploading pitch deck… ${Math.round(progress * 100)}%`
                    : state === "extracting" ? "Extracting document content…"
                    : state === "analyzing" ? "Analyzing pitch deck with AI…"
                    : `Populating your ${profileWord}…`}
                </b>
                <span>{fileName}</span>
              </div>
            </>
          ) : state === "done" ? (
            <>
              <div className="ai-upload-icon ai-ok-icon"><RuwadIcon name="check" size={18} /></div>
              <div className="ai-upload-text" role="status"><b>Pitch deck analyzed successfully.</b><span>{summary.filled} field{summary.filled === 1 ? "" : "s"} filled</span></div>
            </>
          ) : state === "error" ? (
            <>
              <div className="ai-upload-icon ai-error-icon"><RuwadIcon name="help" size={18} /></div>
              <div className="ai-upload-text" role="alert"><b>Couldn&apos;t analyze that file</b><span>{error}</span></div>
            </>
          ) : (
            <>
              <div className="ai-upload-icon"><RuwadIcon name="upload" size={18} /></div>
              <div className="ai-upload-text"><b>{copy.uploadLabel}</b><span>PDF or PPTX — up to 100 MB</span></div>
            </>
          )}
        </div>

        <ul className="ai-upload-benefits">
          {copy.extracts.map((line) => (
            <li key={line}><RuwadIcon name="check" size={13} /> {line}</li>
          ))}
        </ul>
      </div>

      {state === "done" && (
        <p className="fs-13 mt-12" role="status">
          Pitch deck analyzed successfully. Please review the autofilled information before submitting.
          {summary.kept > 0 && <> {summary.kept} field{summary.kept === 1 ? "" : "s"} you had already filled in {summary.kept === 1 ? "was" : "were"} left as you entered {summary.kept === 1 ? "it" : "them"}.</>}
          {meta?.mode === "local" && <> AI reading isn&apos;t available right now, so only clearly labelled details were picked up — please fill in the rest.</>}
          {!!meta?.enrichment?.fields.length && <> {meta.enrichment.fields.length} field{meta.enrichment.fields.length === 1 ? "" : "s"} ({meta.enrichment.fields.join(", ")}) came from public web sources rather than your deck — please verify {meta.enrichment.fields.length === 1 ? "it" : "them"}.</>}
          {meta?.partial && <> Some parts of a long deck couldn&apos;t be fully analyzed, so please check the details.</>}
        </p>
      )}
      {state === "error" && <p className="fs-13 mt-12">You can still complete the form manually.</p>}

      {(state === "done" || state === "error") && (
        <div className="flex gap-8 mt-12">
          <button type="button" className="btn btn-outline btn-xs" disabled={busy} onClick={() => inputRef.current?.click()}>Replace File</button>
          <button type="button" className="btn btn-outline btn-xs" onClick={reset}>Remove</button>
        </div>
      )}

      <div className="hint mt-8"><RuwadIcon name="lock" size={11} /> Your file is secure and used only to prefill your submission.</div>
    </div>
  );
}
