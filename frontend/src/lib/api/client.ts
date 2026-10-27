/** Single fetch entry point for the whole app — every real backend call
 * goes through here so credentials (the httpOnly auth cookie), the base
 * URL and error shape stay consistent in one place instead of scattered
 * fetch() calls. */

/** Where the backend really lives. Used only for server-side fetches (server components can't use a
 * relative URL) — the browser never calls this address directly. */
export const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL?.startsWith("http") ? process.env.NEXT_PUBLIC_API_URL : "http://localhost:4000/api";

/** What the browser calls: this site's own `/api` (proxied to the backend by next.config.ts), so the
 * auth cookie stays first-party. Identical on server and client so rendered URLs never mismatch. */
export const API_BASE = "/api";

/** Large multipart uploads (pitch decks, data-room files…) still go straight to the backend: they are
 * not routed through the Vercel proxy until its request-body limit has been verified. These calls need
 * the auth cookie to be sendable cross-site, exactly as before this proxy was introduced. */
export const UPLOAD_API_BASE = BACKEND_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra diagnostic text the server only sends to admins. */
    public detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A server-side render acts for the visitor who asked for the page. `cookie` is ONLY the RUWĀD session cookie, taken from that request by lib/api/server-session.ts, and it is sent only to the backend.
 * A request carrying it is never cached, so one viewer's data can never be handed to another. */
export interface ServerFetchOptions {
  cookie?: string;
}

async function request<T>(path: string, init?: RequestInit, server?: ServerFetchOptions): Promise<T> {
  // Server-side renders call the backend directly; the browser goes through the same-origin proxy.
  const base = typeof window === "undefined" ? BACKEND_API_URL : API_BASE;
  const res = await fetch(`${base}${path}`, {
    ...init,
    ...(server?.cookie ? { cache: "no-store" as const } : {}),
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(server?.cookie ? { Cookie: server.cookie } : {}), ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    let detail: string | undefined;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // response had no JSON body — keep the status-text fallback
    }
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string, server?: ServerFetchOptions) => request<T>(path, undefined, server),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Detail (by-slug) fetchers use this so a genuine 404 (record renders
 * Next's notFound()) is distinguishable from a backend-down/network error
 * (renders an inline error panel instead) — never collapse both into the
 * same silent `null`. */
export function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}
