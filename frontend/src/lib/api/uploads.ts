import { API_BASE, ApiError } from "./client";

/** Multipart upload — bypasses the shared `api` helper (which always sends
 * JSON) since this needs FormData with no Content-Type header (the browser
 * sets the multipart boundary itself). */
export async function uploadLogo(file: File): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/logo`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    let message = res.statusText || `Upload failed (${res.status})`;
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

/** Resolves a stored logo's id to its servable URL — null/undefined in,
 * null out, so callers can feed this straight into an <img src> guard. */
export function logoUrl(id: string | null | undefined): string | null {
  return id ? `${API_BASE}/uploads/${id}` : null;
}
