import type {
  AdminAdvisorRow, AdvisorApplication, AdvisorProfile, AdvisorSummary, AdvisoryStats, AvailabilityState, BookableStartup, BookingDetail, BookingView, MyAdvisorProfile, SlotOffer,
} from "@/features/advisory/advisory-types";
import { api, isNotFound } from "./client";

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
export const applyAsAdvisor = (body: AdvisorApplication) => api.post("/advisory/advisor/apply", body);
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
export const reviewAdvisor = (id: string, action: "approve" | "reject" | "suspend", notes?: string) => api.post<AdminAdvisorRow>(`/advisory/admin/advisors/${id}/${action}`, { notes });
export const setAdvisorVerified = (id: string, affiliationVerified: boolean) => api.patch<AdminAdvisorRow>(`/advisory/admin/advisors/${id}/verification`, { affiliationVerified });
export const saveAdvisorAvailability = (id: string, windows: { weekday: number; startTime: string; endTime: string }[]) => api.put<AvailabilityState>(`/advisory/admin/advisors/${id}/availability`, { windows });
export const createAdvisorService = (id: string, body: ServiceInput) => api.post<ServiceRow>(`/advisory/admin/advisors/${id}/services`, body);
export const updateAdvisorService = (id: string, serviceId: string, body: Partial<ServiceInput> & { active?: boolean }) => api.patch<ServiceRow>(`/advisory/admin/advisors/${id}/services/${serviceId}`, body);
export const fetchAdminBookings = (q: { status?: string; advisorId?: string; includeDemo?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (q.status) p.set("status", q.status);
  if (q.advisorId) p.set("advisorId", q.advisorId);
  if (q.includeDemo) p.set("includeDemo", "true");
  return api.get<BookingView[]>(`/advisory/admin/bookings${p.toString() ? `?${p}` : ""}`);
};
export const adminCancelBooking = (id: string, reason?: string) => api.post<BookingView>(`/advisory/admin/bookings/${id}/cancel`, { reason });
export const fetchAdvisoryStats = (includeDemo = false) => api.get<AdvisoryStats>(`/advisory/admin/stats${includeDemo ? "?includeDemo=true" : ""}`);
