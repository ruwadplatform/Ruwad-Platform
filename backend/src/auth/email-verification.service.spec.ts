import { NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { EmailVerificationService } from "./email-verification.service";

const config = (vars: Record<string, string | undefined>) => ({ get: (k: string) => vars[k] }) as never;
const build = (vars: Record<string, string | undefined>) => new EmailVerificationService(config(vars), {} as never, {} as never, {} as never, {} as never);
const secret = randomBytes(32).toString("base64");

describe("EmailVerificationService configuration", () => {
  it("is off by default: the endpoints answer 404 and no secret is needed", () => {
    const s = build({});
    expect(s.required).toBe(false);
    expect(() => s.assertEnabled()).toThrow(NotFoundException);
    expect(s.readPendingCookie("anything")).toBeNull();
  });

  it("refuses to be created with verification on and no usable secret (the service would not start)", () => {
    expect(() => build({ EMAIL_VERIFICATION_REQUIRED: "true" })).toThrow(/EMAIL_OTP_SECRET/);
    expect(() => build({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: "short" })).toThrow(/EMAIL_OTP_SECRET/);
    expect(() => build({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: randomBytes(16).toString("base64") })).toThrow(/EMAIL_OTP_SECRET/);
  });

  it("is on with a strong secret, and does not derive anything from JWT_SECRET", () => {
    const s = build({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: secret, JWT_SECRET: "some-jwt-secret" });
    expect(s.required).toBe(true);
    expect(() => s.assertEnabled()).not.toThrow();
    const cookie = s.pendingCookieValue("7c9e6679-7425-40de-944b-e07fc1f90ae7", "muzzammil@example.com");
    expect(s.readPendingCookie(cookie)).toMatchObject({ u: "7c9e6679-7425-40de-944b-e07fc1f90ae7", m: "m***@example.com" });
    // a service with a different EMAIL_OTP_SECRET cannot read it, and JWT_SECRET plays no part
    const other = build({ EMAIL_VERIFICATION_REQUIRED: "true", EMAIL_OTP_SECRET: randomBytes(32).toString("base64"), JWT_SECRET: "some-jwt-secret" });
    expect(other.readPendingCookie(cookie)).toBeNull();
  });
});
