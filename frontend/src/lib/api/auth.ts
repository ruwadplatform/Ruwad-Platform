import { api } from "./client";
import type { ApiSettings, ApiUser } from "./types";
import type { VerificationRequired } from "@/features/auth/verify-email-logic";

export function register(input: {
  firstName: string; lastName: string; email: string; password: string;
  role?: string; jobTitle?: string; organization?: string;
  organizationWebsite?: string; organizationStage?: string; organizationCategory?: string;
  organizationCity?: string; organizationType?: string;
  country?: string; city?: string; phone?: string; interests?: string[];
}): Promise<ApiUser | VerificationRequired> {
  // With email verification switched on the backend answers { status: "verification_required" } and signs nobody in; otherwise it returns the new user, as before.
  return api.post<ApiUser | VerificationRequired>("/auth/register", input);
}

export interface VerifyEmailResult { verified: true; signedIn: boolean; user?: ApiUser }

/** Checks the 6-digit code. `email` is only needed from a browser that did not start the sign-up. */
export function verifyEmail(code: string, email?: string): Promise<VerifyEmailResult> {
  return api.post<VerifyEmailResult>("/auth/verify-email", { code, ...(email ? { email } : {}) });
}

/** Asks for a new code (the previous one stops working). The answer is the same for every address. */
export function resendVerification(email?: string): Promise<{ message: string; resendAfterSeconds: number }> {
  return api.post<{ message: string; resendAfterSeconds: number }>("/auth/resend-verification", email ? { email } : {});
}

/** Which address this browser is verifying, read from its pending-verification cookie. */
export function pendingVerification(): Promise<{ pending: boolean; maskedEmail: string | null }> {
  return api.get<{ pending: boolean; maskedEmail: string | null }>("/auth/pending-verification");
}

export function login(email: string, password: string): Promise<ApiUser> {
  return api.post<ApiUser>("/auth/login", { email, password });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/forgot-password", { email });
}

export function resetPassword(token: string, password: string, confirmPassword: string): Promise<{ message: string }> {
  return api.post<{ message: string }>("/auth/reset-password", { token, password, confirmPassword });
}

export function me(): Promise<ApiUser> {
  return api.get<ApiUser>("/auth/me");
}

export function logout(): Promise<{ success: boolean }> {
  return api.post<{ success: boolean }>("/auth/logout");
}

export function updateProfile(patch: Partial<Pick<ApiUser, "firstName" | "lastName" | "jobTitle" | "organization" | "organizationWebsite" | "organizationStage" | "organizationCategory" | "organizationCity" | "organizationType" | "country" | "city" | "bio" | "linkedin" | "interests" | "profileImageId">>): Promise<ApiUser> {
  return api.patch<ApiUser>("/users/me", patch);
}

export function getSettings(): Promise<ApiSettings> {
  return api.get<ApiSettings>("/users/me/settings");
}

export function updateSettings(patch: Partial<ApiSettings>): Promise<ApiSettings> {
  return api.patch<ApiSettings>("/users/me/settings", patch);
}
