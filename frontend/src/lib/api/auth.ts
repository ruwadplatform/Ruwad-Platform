import { api } from "./client";
import type { ApiSettings, ApiUser } from "./types";

export function register(input: {
  firstName: string; lastName: string; email: string; password: string;
  role?: string; jobTitle?: string; organization?: string;
  organizationWebsite?: string; organizationStage?: string; organizationCategory?: string;
  organizationCity?: string; organizationType?: string;
  country?: string; city?: string; interests?: string[];
}): Promise<ApiUser> {
  return api.post<ApiUser>("/auth/register", input);
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

export function updateProfile(patch: Partial<Pick<ApiUser, "firstName" | "lastName" | "jobTitle" | "organization" | "organizationWebsite" | "organizationStage" | "organizationCategory" | "organizationCity" | "organizationType" | "country" | "city" | "bio" | "linkedin" | "interests">>): Promise<ApiUser> {
  return api.patch<ApiUser>("/users/me", patch);
}

export function getSettings(): Promise<ApiSettings> {
  return api.get<ApiSettings>("/users/me/settings");
}

export function updateSettings(patch: Partial<ApiSettings>): Promise<ApiSettings> {
  return api.patch<ApiSettings>("/users/me/settings", patch);
}
