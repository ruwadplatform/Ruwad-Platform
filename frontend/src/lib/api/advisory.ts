import type {
  AdminAdvisorRow, AdvisorApplication, AdvisorProfile, ApplicationDetail, ApplicationDocument, ApplicationList, AdvisorSummary, AdvisoryStats, AutomationReport, AutomationStatus, AvailabilityState, BookableStartup, BookingDetail, BookingView, JoinInfo, ManualOutcome, MeetingStatus, MyAdvisorProfile, SlotOffer,
} from "@/features/advisory/advisory-types";
import { API_BASE, ApiError, api, isNotFound } from "./client";

/** Advisory Services data access — the one place the screens call the backend (`/api/advisory/...`).
 *
 * There is deliberately NO fallback to demonstration data here: if the backend can't be reached the screens show an error, and a booking is only
 * ever shown as made after the server says so. The fictional demonstration advisors come from the backend like any advisor, flagged `isDemo`. */

// ---- directory, profiles, slots (public) -----------------------------------------------------------------------------------------------------------

export function fetchAdvisors(): Promise<AdvisorSummary[]> {
  return api.get<AdvisorSummary[]>("/advisory/advisors");
}

/** Null when there is no such (approved) advisor; any other failure throws so the screen can say it couldn't load. */
export async function fetchAdvisor(id: string): Promise<AdvisorProfile | null> {
  try {
    return await api.get<AdvisorProfile>(`/advisory/advisors/${encodeURIComponent(id)}`);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export function fetchBookableDates(advisorId: string, serviceId: string): Promise<{ dates: string[]; minutes: number }> {
  return api.get(`/advisory/advisors/${encodeURIComponent(advisorId)}/dates?serviceId=${encodeURIComponent(serviceId)}`);
}

export function fetchSlots(advisorId: string, serviceId: string, date: string): Promise<{ date: string; minutes: number; slots: SlotOffer[] }> {
  return api.get(`/advisory/advisors/${encodeURIComponent(advisorId)}/slots?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`);
}

// ---- a founder's bookings --------------------------------------------------------------------------------------------------------------------------

/** Public and read-only: whether online consultation booking is open. The server enforces it on every booking route; this lets the screens say so first. */
export const fetchAdvisoryStatus = () => api.get<{ bookingsEnabled: boolean }>("/advisory/status");

export const fetchMyStartups = () => api.get<BookableStartup[]>("/advisory/my-startups");
export const createBooking = (body: { advisor: string; serviceId: string; startupId: string; startsAt: string; description?: string }) => api.post<BookingView>("/advisory/bookings", body);
export const fetchMyBookings = () => api.get<BookingView[]>("/advisory/bookings/mine");
export const fetchBooking = (id: string) => api.get<BookingDetail>(`/advisory/bookings/${id}`);
export const cancelBooking = (id: string, reason?: string) => api.post<BookingView>(`/advisory/bookings/${id}/cancel`, { reason });

// Rescheduling is by mutual agreement: a proposal waits for the OTHER party, and the original booking stays in place until it's accepted.
export const fetchRescheduleDates = (id: string) => api.get<{ dates: string[]; minutes: number }>(`/advisory/bookings/${id}/reschedule/dates`);
export const fetchRescheduleSlots = (id: string, date: string) => api.get<{ date: string; minutes: number; slots: SlotOffer[] }>(`/advisory/bookings/${id}/reschedule/slots?date=${encodeURIComponent(date)}`);
export const proposeReschedule = (id: string, startsAt: string, note?: string) => api.post<BookingView>(`/advisory/bookings/${id}/reschedule`, { startsAt, note });
export const acceptReschedule = (id: string) => api.post<BookingView>(`/advisory/bookings/${id}/reschedule/accept`);
export const declineReschedule = (id: string, note?: string) => api.post<BookingView>(`/advisory/bookings/${id}/reschedule/decline`, { note });
export const withdrawReschedule = (id: string) => api.post<BookingView>(`/advisory/bookings/${id}/reschedule/withdraw`);

// ---- the advisor's dashboard -----------------------------------------------------------------------------------------------------------------------

export const fetchMyAdvisorProfile = () => api.get<{ advisor: MyAdvisorProfile | null }>("/advisory/advisor/me");

/** The "Become an Advisor" application: the form as JSON plus the CV (required), certificates and photograph, sent as one multipart request straight to
 * this site's own /api, like every other call, so the sign-in cookie (which belongs to this site) goes with it. Nothing is saved unless everything passes; the server re-checks every field and every file's real contents. */
export async function submitAdvisorApplication(payload: Record<string, unknown>, files: { cv: File; certificates: File[]; photo: File | null }): Promise<{ reference: string; status: string; submittedAt: string }> {
  const form = new FormData();
  form.append("data", JSON.stringify(payload)); // text first, so it is parsed before the file streams
  form.append("cv", files.cv);
  for (const c of files.certificates) form.append("certificates", c);
  if (files.photo) form.append("photo", files.photo);
  const res = await fetch(`${API_BASE}/advisory/advisor/apply`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) throw await uploadError(res);
  return res.json();
}

/** Edit & Reapply: the owner of a REJECTED application sends the updated form (and any new files) for review again. A CV on file is kept unless a new one is attached. */
export async function resubmitAdvisorApplication(payload: Record<string, unknown>, files: { cv: File | null; certificates: File[]; photo: File | null }): Promise<{ reference: string; status: string; submittedAt: string; attempt: number }> {
  const form = new FormData();
  form.append("data", JSON.stringify(payload));
  if (files.cv) form.append("cv", files.cv);
  for (const c of files.certificates) form.append("certificates", c);
  if (files.photo) form.append("photo", files.photo);
  const res = await fetch(`${API_BASE}/advisory/advisor/reapply`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) throw await uploadError(res);
  return res.json();
}

async function uploadError(res: Response): Promise<ApiError> {
  if (res.status === 413) return new ApiError(413, "One of your files is too large. A CV or certificate can be up to 2 MB and a photograph up to 1 MB (8 MB in total).");
  if (res.status === 502 || res.status === 503 || res.status === 504) return new ApiError(res.status, "The upload didn't reach RUWĀD (the connection dropped). Nothing was saved. Please try again, or use smaller files.");
  if (res.status === 429) return new ApiError(429, "Too many attempts. Please wait a little and try again.");
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.message) message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
  } catch {
    // no JSON body: keep the status text
  }
  return new ApiError(res.status, message);
}
export const updateMyAdvisorProfile = (body: Partial<AdvisorApplication>) => api.patch<{ advisor: MyAdvisorProfile | null }>("/advisory/advisor/me", body);
export const fetchAdvisorBookings = () => api.get<BookingView[]>("/advisory/advisor/bookings");
export const approveBooking = (id: string) => api.post<BookingView>(`/advisory/advisor/bookings/${id}/approve`);
export const rejectBooking = (id: string, note?: string) => api.post<BookingView>(`/advisory/advisor/bookings/${id}/reject`, { note });
export const completeBooking = (id: string) => api.post<BookingView>(`/advisory/advisor/bookings/${id}/complete`);

export const fetchMyAvailability = () => api.get<AvailabilityState>("/advisory/advisor/availability");
export const saveMyAvailability = (windows: { weekday: number; startTime: string; endTime: string }[]) => api.put<AvailabilityState>("/advisory/advisor/availability", { windows });
export const addMyTimeOff = (body: { date: string; startTime?: string; endTime?: string; reason?: string }) => api.post<AvailabilityState>("/advisory/advisor/availability/time-off", body);
export const removeMyTimeOff = (id: string) => api.delete<AvailabilityState>(`/advisory/advisor/availability/time-off/${id}`);

export interface ServiceRow { id: string; typeId: string; name: string; description: string; minutes: number; active: boolean }
export type ServiceInput = { typeId: string; name: string; description: string; minutes: number };
export const fetchMyServices = () => api.get<ServiceRow[]>("/advisory/advisor/services");
export const createMyService = (body: ServiceInput) => api.post<ServiceRow>("/advisory/advisor/services", body);
export const updateMyService = (id: string, body: Partial<ServiceInput> & { active?: boolean }) => api.patch<ServiceRow>(`/advisory/advisor/services/${id}`, body);

// ---- administrators --------------------------------------------------------------------------------------------------------------------------------

export const fetchAdminAdvisors = (status?: string) => api.get<AdminAdvisorRow[]>(`/advisory/admin/advisors${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const fetchAdminAdvisor = (id: string) => api.get<AdminAdvisorRow & { profile: AdvisorProfile & { services: ServiceRow[] }; availability: AvailabilityState }>(`/advisory/admin/advisors/${id}`);
export const fetchAdminApplications = (status?: string) => api.get<ApplicationList>(`/advisory/admin/applications${status && status !== "ALL" ? `?status=${encodeURIComponent(status)}` : ""}`);
export const fetchAdminApplication = (id: string) => api.get<ApplicationDetail>(`/advisory/admin/applications/${id}`);
/** Fetches the file with the administrator's session and hands it to the browser as a download. The endpoint is never a public link. */
export async function downloadApplicationDocument(applicationId: string, doc: Pick<ApplicationDocument, "id" | "fileName">): Promise<void> {
  const res = await fetch(`${API_BASE}/advisory/admin/applications/${applicationId}/documents/${doc.id}`, { credentials: "include" });
  if (!res.ok) throw await uploadError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = doc.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const reviewAdvisor = (id: string, action: "approve" | "reject" | "suspend", notes?: string) => api.post<AdminAdvisorRow>(`/advisory/admin/advisors/${id}/${action}`, { notes });
export const setAdvisorVerified = (id: string, affiliationVerified: boolean) => api.patch<AdminAdvisorRow>(`/advisory/admin/advisors/${id}/verification`, { affiliationVerified });
export const saveAdvisorAvailability = (id: string, windows: { weekday: number; startTime: string; endTime: string }[]) => api.put<AvailabilityState>(`/advisory/admin/advisors/${id}/availability`, { windows });
export const createAdvisorService = (id: string, body: ServiceInput) => api.post<ServiceRow>(`/advisory/admin/advisors/${id}/services`, body);
export const updateAdvisorService = (id: string, serviceId: string, body: Partial<ServiceInput> & { active?: boolean }) => api.patch<ServiceRow>(`/advisory/admin/advisors/${id}/services/${serviceId}`, body);
export const fetchAdminBookings = (q: { status?: string; advisorId?: string; includeDemo?: boolean; needsReview?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.advisorId) p.set("advisorId", q.advisorId);
  if (q.includeDemo) p.set("includeDemo", "true");
  if (q.needsReview) p.set("needsReview", "true");
  return api.get<BookingView[]>(`/advisory/admin/bookings${p.toString() ? `?${p}` : ""}`);
};
export const adminCancelBooking = (id: string, reason?: string) => api.post<BookingView>(`/advisory/admin/bookings/${id}/cancel`, { reason });
export const fetchAdvisoryStats = (includeDemo = false) => api.get<AdvisoryStats>(`/advisory/admin/stats${includeDemo ? "?includeDemo=true" : ""}`);

// ---- automation (administrators) ---------------------------------------------------------------------------------------------------------------

export const fetchAutomationStatus = () => api.get<AutomationStatus>("/advisory/admin/automation/status");
/** One pass of the scheduler's rules. A dry run reports what would happen and changes nothing. */
export const runAutomation = (dryRun: boolean) => api.post<AutomationReport>(`/advisory/admin/automation/run?dryRun=${dryRun ? "true" : "false"}`);

// ---- video meetings --------------------------------------------------------------------------------------------------------------------------------

export const fetchMeetingStatus = (id: string) => api.get<MeetingStatus>(`/advisory/bookings/${id}/meeting`);
/** Asks the server for a short-lived, single-room token. Only the advisor and the startup's owner/admin, only for a confirmed consultation, only inside the join window. */
export const joinMeeting = (id: string) => api.post<JoinInfo>(`/advisory/bookings/${id}/meeting/join`);
/** A person in a SIMULATED room reports that they joined or left. (A real meeting's attendance comes from the video provider, never from the browser.) */
export const reportPresence = (id: string, event: "joined" | "left") => api.post<{ ok: true }>(`/advisory/bookings/${id}/meeting/presence`, { event });
/** The advisor, or an administrator, records what happened at a consultation that has ended; it becomes COMPLETED with that outcome. */
export const resolveOutcome = (id: string, outcome: ManualOutcome, note?: string) => api.post<BookingView>(`/advisory/bookings/${id}/outcome`, { outcome, note });
