/** Email verification (6-digit code) settings, read from the environment.
 *
 * EMAIL_VERIFICATION_REQUIRED is OFF unless it is exactly "true". Off means the application behaves exactly as it did before this feature existed
 * (sign-up signs the user in at once, nothing is asked for), which is both the safe default and the emergency stop.
 *
 * EMAIL_OTP_SECRET is the key that protects the stored code hashes and the "pending verification" cookie. It is its own secret (base64, at least 32
 * bytes), never derived from JWT_SECRET. It is only REQUIRED while verification is switched on, and then it is validated at start-up: a missing or weak
 * secret stops the service from starting instead of quietly running with weak protection. */

export const OTP_SECRET_MIN_BYTES = 32;

export const emailVerificationRequired = (get: (key: string) => string | undefined): boolean => get("EMAIL_VERIFICATION_REQUIRED")?.trim() === "true";

/** The secret as bytes, or null when it is missing, malformed, too short or obviously not random (a repeated character or only a few distinct bytes). */
export function readOtpSecret(get: (key: string) => string | undefined): Buffer | null {
  const raw = (get("EMAIL_OTP_SECRET") ?? "").trim();
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length < OTP_SECRET_MIN_BYTES) return null;
  if (new Set(key).size < 8) return null;
  return key;
}

/** Throws (so the service refuses to start) when verification is required but the secret is not usable. The message names the setting only, never a value. */
export function assertOtpConfig(get: (key: string) => string | undefined): void {
  if (!emailVerificationRequired(get)) return;
  if (!readOtpSecret(get)) {
    throw new Error(`EMAIL_VERIFICATION_REQUIRED is on but EMAIL_OTP_SECRET is missing or weak: it must be base64 of at least ${OTP_SECRET_MIN_BYTES} random bytes (for example \`openssl rand -base64 32\`).`);
  }
}
