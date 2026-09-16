"use client";

import { useRef, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { autofillSubmission } from "@/lib/api/submission-autofill";
import { ApiError } from "@/lib/api/client";
import type { ApiSubmissionKind } from "@/lib/api/types";

const ALLOWED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_BYTES = 5 * 1024 * 1024;

interface AutofillCopy {
  title: string;
  uploadLabel: string;
  description: string;
  extracts: string[];
}

/** Per-kind copy for the card — exact wording per the product spec. PDF/DOCX
 * only (matches the backend's actual extraction support): pdf-parse/mammoth
 * can't read native .pptx, so the copy says "PDF or Word document" with a
 * one-line export hint rather than implying .pptx support outright. */
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

type UploadState = "idle" | "analyzing" | "done" | "error";

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
  onExtracted: (fields: Record<string, unknown>) => void;
}) {
  const copy = AI_AUTOFILL_COPY[kind];
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filledCount, setFilledCount] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setState("error");
      setError("Please upload a PDF or Word (.docx) document. Export your deck to PDF for best results.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setError("File must be 5MB or smaller.");
      return;
    }
    setFileName(file.name);
    setState("analyzing");
    try {
      const fields = await autofillSubmission(submissionId, file);
      setFilledCount(Object.keys(fields).length);
      setState("done");
      onExtracted(fields);
    } catch (e) {
      setState("error");
      setError(e instanceof ApiError ? e.message : "Couldn't analyze that file — please fill in the form manually.");
    }
  }

  function reset() {
    setState("idle");
    setFileName(null);
    setError(null);
    setFilledCount(0);
  }

  return (
    <div
      className={`ai-upload-panel-lg${drag ? " drag" : ""}${state === "error" ? " ai-error" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
    >
      <input
        ref={inputRef} type="file" accept=".pdf,.docx" style={{ display: "none" }}
        onChange={(e) => handleFile(e.target.files?.[0])}
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
          style={{ flex: "1 1 260px", cursor: state === "analyzing" ? "default" : "pointer" }}
          onClick={() => state !== "analyzing" && inputRef.current?.click()}
        >
          {state === "analyzing" ? (
            <>
              <div className="ai-upload-spinner" />
              <div className="ai-upload-text"><b>Analyzing your document…</b><span>{fileName}</span></div>
            </>
          ) : state === "done" ? (
            <>
              <div className="ai-upload-icon ai-ok-icon"><RuwadIcon name="check" size={18} /></div>
              <div className="ai-upload-text"><b>AI analysis complete</b><span>{filledCount} field{filledCount === 1 ? "" : "s"} filled</span></div>
            </>
          ) : state === "error" ? (
            <>
              <div className="ai-upload-icon ai-error-icon"><RuwadIcon name="help" size={18} /></div>
              <div className="ai-upload-text"><b>Couldn&apos;t read that file</b><span>{error}</span></div>
            </>
          ) : (
            <>
              <div className="ai-upload-icon"><RuwadIcon name="upload" size={18} /></div>
              <div className="ai-upload-text"><b>{copy.uploadLabel}</b><span>PDF, Word — up to 5MB</span></div>
            </>
          )}
        </div>

        <ul className="ai-upload-benefits">
          {copy.extracts.map((line) => (
            <li key={line}><RuwadIcon name="check" size={13} /> {line}</li>
          ))}
        </ul>
      </div>

      {(state === "done" || state === "error") && (
        <div className="flex gap-8 mt-12">
          <button type="button" className="btn btn-outline btn-xs" onClick={() => inputRef.current?.click()}>Replace File</button>
          <button type="button" className="btn btn-outline btn-xs" onClick={reset}>Remove</button>
        </div>
      )}

      <div className="hint mt-8"><RuwadIcon name="lock" size={11} /> Your file is secure and used only to prefill your submission.</div>
    </div>
  );
}
