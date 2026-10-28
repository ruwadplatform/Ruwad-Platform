import { cookies } from "next/headers";
import type { ServerFetchOptions } from "./client";
import { SESSION_COOKIE, forwardableSessionCookie } from "./session-cookie.ts";

/** For a server-rendered page that must show what THIS visitor may see: the session cookie of the incoming request, and nothing else from it, for the backend call.
 * Reading the cookie makes the page dynamic, so the response is rendered per request and is never shared between visitors. Pages that must only ever contain
 * public information (metadata, structured data, the sitemap) do not call this. */
export async function sessionFetchOptions(): Promise<ServerFetchOptions> {
  const cookie = forwardableSessionCookie((await cookies()).get(SESSION_COOKIE)?.value);
  return cookie ? { cookie } : {};
}
