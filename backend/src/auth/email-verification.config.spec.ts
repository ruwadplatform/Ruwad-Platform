import { randomBytes } from "crypto";
import { assertOtpConfig, emailVerificationRequired, readOtpSecret } from "./email-verification.config";

const env = (vars: Record<string, string | undefined>) => (k: string) => vars[k];
const good = randomBytes(32).toString("base64");

describe("EMAIL_VERIFICATION_REQUIRED", () => {
  it("is off by default and for anything that is not exactly \"true\"", () => {
    expect(emailVerificationRequired(env({}))).toBe(false);
    for (const v of ["", "false", "FALSE", "1", "yes", "on", "True", "truee"]) expect(emailVerificationRequired(env({ EMAIL_VERIFICATION_REQUIRED: v }))).toBe(false);
  });

  it("is on only for \"true\" (surrounding spaces ignored)", () => {
    expect(emailVerificationRequired(env({ EMAIL_VERIFICATION_REQUIRED: "true" }))).toBe(true);
    expect(emailVerificationRequired(env({ EMAIL_VERIFICATION_REQUIRED: " true " }))).toBe(true);
  });
});

describe("EMAIL_OTP_SECRET strength", () => {
  it("accepts base64 of 32 or more random bytes", () => {
    expect(readOtpSecret(env({ EMAIL_OTP_SECRET: good }))?.length).toBe(32);
    expect(readOtpSecret(env({ EMAIL_OTP_SECRET: randomBytes(64).toString("base64") }))?.length).toBe(64);
    expect(readOtpSecret(env({ EMAIL_OTP_SECRET: `  ${good}  ` }))).not.toBeNull();
  });

  it("rejects a missing, short, malformed or obviously non-random value", () => {
    for (const v of [undefined, "", "   ", randomBytes(16).toString("base64"), randomBytes(31).toString("base64"), "not base64!!", "A".repeat(60), Buffer.alloc(32, 7).toString("base64"), Buffer.from("abcabcabcabcabcabcabcabcabcabcabc").toString("base64"), "change-me"]) {
      expect(readOtpSecret(env({ EMAIL_OTP_SECRET: v }))).toBeNull();
    }
  });
});

describe("start-up check", () => {
  it("does nothing while verification is off, whatever the secret is", () => {
    expect(() => assertOtpConfig(env({}))).not.toThrow();
    expect(() => assertOtpConfig(env({ EMAIL_OTP_SECRET: "weak" }))).not.toThrow();
  });

  it("refuses to start with verification on and no usable secret, naming the setting but never a value", () => {
    expect(() => assertOtpConfig(env({ EMAIL_VERIFICATION_REQUIRED: "true" }))).toThrow(/EMAIL_OTP_SECRET/);
    let message = "";
    try { assertOtpConfig(env({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: "super-secret-value-123" })); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/EMAIL_OTP_SECRET/);
    expect(message).not.toContain("super-secret-value-123");
  });

  it("starts with verification on and a strong secret", () => {
    expect(() => assertOtpConfig(env({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: good }))).not.toThrow();
  });
});
