import { API_BASE, ApiError } from "./client";

export interface AutofillMeta {
  units: number; chunks: number; skipped: number; partial: boolean;
  /** "local" = basic pattern reading (no AI key configured); "ai" = AI extraction. */
  mode?: "local" | "ai";
  /** Fields filled from public web sources (never overwrites the deck). */
  enrichment?: { searches: number; cached: number; fields: string[]; sources: { field: string; url: string; domain: string; type: string }[] } | null;
}
export interface AutofillResult { fields: Record<string, unknown>; meta: AutofillMeta | null }

export const PITCH_DECK_MAX_BYTES = 100 * 1024 * 1024;
export const PITCH_DECK_MIME = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export const MSG_UNSUPPORTED_TYPE = "Only PDF and PPTX files are supported.";
export const MSG_TOO_LARGE = "Pitch deck must be 100 MB or smaller.";

/** Client-side check: extension, MIME type, size and the file's real first bytes. Returns the file to send (with its MIME
 * type filled in when the browser didn't know the PPTX/PDF type) or an error message. The server repeats every check. */
export async function checkPitchDeck(file: File): Promise<{ ok: true; file: File } | { ok: false; message: string }> {
  const name = file.name.toLowerCase();
  const ext = name.endsWith(".pdf") ? "pdf" : name.endsWith(".pptx") ? "pptx" : null;
  if (!ext) return { ok: false, message: MSG_UNSUPPORTED_TYPE };
  const known = Object.values(PITCH_DECK_MIME) as string[];
  const unknownType = file.type === "" || file.type === "application/octet-stream"; // some browsers don't know .pptx
  if (file.type && !unknownType && !known.includes(file.type)) return { ok: false, message: MSG_UNSUPPORTED_TYPE };
  if (!unknownType && file.type !== PITCH_DECK_MIME[ext]) return { ok: false, message: MSG_UNSUPPORTED_TYPE }; // e.g. a .pdf that says it's a .pptx
  if (file.size > PITCH_DECK_MAX_BYTES) return { ok: false, message: MSG_TOO_LARGE };
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = String.fromCharCode(...head);
  const looksRight = ext === "pdf" ? text.includes("%PDF-") : head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!looksRight) return { ok: false, message: MSG_UNSUPPORTED_TYPE };
  return { ok: true, file: unknownType ? new File([file], file.name, { type: PITCH_DECK_MIME[ext] }) : file };
}

/** Multipart upload with progress (fetch can't report upload progress). Authenticated; returns the extracted
 * fields only — the caller decides how to merge them into the form (SubmissionWizard.applyAiAutofill), and this
 * never touches the submission's stored data itself. */
export function autofillSubmission(submissionId: string, file: File, handlers: { onUploadProgress?: (fraction: number) => void; onUploaded?: () => void } = {}): Promise<AutofillResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/submissions/${encodeURIComponent(submissionId)}/autofill`);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.timeout = 15 * 60 * 1000; // a 100 MB upload on a slow connection can take a while
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) handlers.onUploadProgress?.(e.loaded / e.total); };
    xhr.upload.onload = () => handlers.onUploaded?.();
    xhr.onerror = () => reject(new ApiError(0, "Couldn't reach the server. Check your connection and try again."));
    xhr.ontimeout = () => reject(new ApiError(0, "The upload took too long. Please try again."));
    xhr.onload = () => {
      let body: { fields?: Record<string, unknown>; meta?: AutofillMeta; message?: string | string[] } | null = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { body = null; }
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ fields: body?.fields ?? {}, meta: body?.meta ?? null });
      const message = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
      reject(new ApiError(xhr.status, message || (xhr.status === 413 ? MSG_TOO_LARGE : "Unable to analyze the pitch deck.")));
    };
    xhr.send(form);
  });
}
