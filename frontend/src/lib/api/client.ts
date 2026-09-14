/** Single fetch entry point for the whole app — every real backend call
 * goes through here so credentials (the httpOnly auth cookie), the base
 * URL and error shape stay consistent in one place instead of scattered
 * fetch() calls. */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      // response had no JSON body — keep the status-text fallback
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Detail (by-slug) fetchers use this so a genuine 404 (record renders
 * Next's notFound()) is distinguishable from a backend-down/network error
 * (renders an inline error panel instead) — never collapse both into the
 * same silent `null`. */
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}
