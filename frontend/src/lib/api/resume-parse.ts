import { API_BASE, ApiError } from "./client";

export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  organization?: string;
  city?: string;
  country?: string;
  /** "local" = basic pattern reading (no AI key configured); "ai" = AI extraction. */
  mode?: "local" | "ai";
}

/** Multipart upload, same pattern as uploadLogo — bypasses the shared `api`
 * helper (always JSON) for FormData with a browser-set boundary. Public,
 * unauthenticated endpoint: called from the signup wizard before an
 * account exists. */
export async function parseResume(file: File): Promise<ParsedResume> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/resume-parse`, { method: "POST", credentials: "include", body: form });
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
  return res.json();
}
