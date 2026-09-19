/** Live password feedback for the reset form. These rules mirror
 * backend/src/auth/password-policy.ts, which is the authority — this file
 * only drives the checklist, the strength meter and the button state. */

export interface PasswordRule { id: string; label: string; test: (pw: string) => boolean }

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "One special character", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export type PasswordStrength = "weak" | "medium" | "strong";

export function evaluatePassword(password: string): {
  results: { rule: PasswordRule; met: boolean }[];
  metCount: number;
  strength: PasswordStrength;
  strong: boolean;
} {
  const results = PASSWORD_RULES.map((rule) => ({ rule, met: rule.test(password) }));
  const metCount = results.filter((r) => r.met).length;
  // Strong = every rule met; Medium = most (3-4 of 5); Weak = only a few.
  const strength: PasswordStrength = metCount === PASSWORD_RULES.length ? "strong" : metCount >= 3 ? "medium" : "weak";
  return { results, metCount, strength, strong: strength === "strong" };
}
