/** Name of the httpOnly cookie the backend sets at sign-in (see backend/src/auth/jwt.strategy.ts). */
export const SESSION_COOKIE = "ruwad_token";

/** A JWT is three base64url segments. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** The one cookie a server-side render passes to the backend on behalf of the visitor: the RUWĀD session, and only when it has the shape of a token. Anything else (no cookie, an
 * empty one, text that could smuggle in another header) is not forwarded, and the visitor is treated as signed out. */
export function forwardableSessionCookie(token: string | undefined | null): string | undefined {
  return token && JWT_SHAPE.test(token) ? `${SESSION_COOKIE}=${token}` : undefined;
}
