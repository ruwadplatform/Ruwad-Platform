/** The rules of the email-verification screen, with no React in them so they can be tested on their own: what the six boxes do with typing, pasting and
 * deleting, how the resend countdown reads, and which words a failure shows. The server is the authority on every limit; this only makes it pleasant. */

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;
export const SUPPORT_EMAIL = "ruwadplatform@gmail.com";

export interface VerificationRequired { status: "verification_required"; message: string; resendAfterSeconds: number }

/** True for the sign-up answer that means "no account session yet: a code was sent" (only while the backend has verification switched on). */
export function isVerificationRequired(answer: unknown): answer is VerificationRequired {
  return typeof answer === "object" && answer !== null && (answer as { status?: unknown }).status === "verification_required";
}

export const emptyCode = (): string[] => Array.from({ length: OTP_LENGTH }, () => "");
export const digitsToCode = (digits: string[]): string => digits.join("");
export const isComplete = (digits: string[]): boolean => digits.length === OTP_LENGTH && digits.every((d) => /^\d$/.test(d));

/** Only the digits of whatever was typed or pasted ("123 456", "123-456", "Your code is 123456"), at most six. */
export const sanitizeDigits = (text: string): string => text.replace(/\D/g, "").slice(0, OTP_LENGTH);

/** What typing or pasting `raw` into box `index` does. Returns the new boxes and which box should hold the cursor next. A paste (or an autofill that drops the whole
 * code into one box) spreads over the boxes from the START when it carries a full code, otherwise from the box it landed in. Typing nothing clears the box. */
export function applyInput(digits: string[], index: number, raw: string): { digits: string[]; focus: number } {
  const next = digits.slice();
  const typed = sanitizeDigits(raw);
  if (!typed) {
    next[index] = "";
    return { digits: next, focus: index };
  }
  if (typed.length === OTP_LENGTH) return { digits: typed.split(""), focus: OTP_LENGTH - 1 };
  // A single box that already held a digit and received one more keeps the newest digit (typing over it).
  const chars = typed.length === 2 && digits[index] ? [typed.replace(digits[index]!, "").slice(0, 1) || typed.slice(-1)] : typed.split("");
  let at = index;
  for (const c of chars) {
    if (at >= OTP_LENGTH) break;
    next[at++] = c;
  }
  return { digits: next, focus: Math.min(at, OTP_LENGTH - 1) };
}

/** Backspace: clears the box if it has a digit, otherwise steps back and clears the previous one. */
export function backspace(digits: string[], index: number): { digits: string[]; focus: number } {
  const next = digits.slice();
  if (next[index]) {
    next[index] = "";
    return { digits: next, focus: index };
  }
  const prev = Math.max(index - 1, 0);
  next[prev] = "";
  return { digits: next, focus: prev };
}

/** Whole seconds left until `untilMs`, never negative. */
export const secondsLeft = (untilMs: number, nowMs: number): number => Math.max(0, Math.ceil((untilMs - nowMs) / 1000));

/** "0:45" */
export const formatCountdown = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** How much of the resend wait is left when the page opens, from when the last code was sent (null if unknown: then wait the full time, the server enforces it anyway). */
export const initialResendWait = (sentAtMs: number | null, nowMs: number): number => (sentAtMs === null || sentAtMs > nowMs ? RESEND_SECONDS : secondsLeft(sentAtMs + RESEND_SECONDS * 1000, nowMs));

export interface Shown { text: string; retryAfter?: number; kind: "invalid" | "wait" | "limit" | "unavailable" | "throttled" | "network" | "other" }

/** The words a failure shows. Never a status code, never a stack: the server's own safe message where it sent one, a plain sentence otherwise. */
export function messageFor(err: unknown): Shown {
  const e = (typeof err === "object" && err !== null ? err : {}) as { status?: number; code?: string; message?: string; retryAfterSeconds?: number | null };
  if (e.code === "INVALID_OTP") return { kind: "invalid", text: "That code isn't valid or has expired. Request a new one." };
  if (e.code === "RESEND_COOLDOWN") return { kind: "wait", text: "Please wait a moment before asking for another code.", retryAfter: typeof e.retryAfterSeconds === "number" ? e.retryAfterSeconds : RESEND_SECONDS };
  if (e.code === "RESEND_LIMIT") return { kind: "limit", text: `Too many codes have been requested. Try again later, or contact ${SUPPORT_EMAIL}.` };
  if (e.status === 404) return { kind: "unavailable", text: "Email verification isn't available right now. Please try again later." };
  if (e.status === 429) return { kind: "throttled", text: "Too many attempts. Please wait a minute and try again." };
  if (e.status === 0 || e.status === undefined) return { kind: "network", text: "We couldn't reach RUWĀD. Check your connection and try again." };
  return { kind: "other", text: "Something went wrong. Please try again." };
}
