/** Password rules enforced on reset. The frontend mirrors these
 * (frontend/src/lib/password-rules.ts) for live feedback, but this is the
 * authority — a request that skips the UI is held to the same rules. */
export const PASSWORD_MIN_LENGTH = 8;

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}
