import { API_BASE, ApiError } from "./client";

/** Multipart upload, same pattern as parseResume/uploadLogo — bypasses the
 * shared `api` helper (always JSON) for FormData with a browser-set
 * boundary. Authenticated (submission forms are always post-login, unlike
 * the public /resume-parse used pre-signup): returns the extracted fields
 * only — the caller decides how to merge them into the current payload
 * (see SubmissionWizard's applyAiAutofill), this never touches the
 * submission's stored payload itself. */
export async function autofillSubmission(submissionId: string, file: File): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/submissions/${submissionId}/autofill`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    let message = res.statusText || `Couldn't read that file (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      // no JSON body — keep the status-text fallback
    }
    throw new ApiError(res.status, message);
  }
  const body = await res.json();
  return body.fields ?? {};
}
