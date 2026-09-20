import { api } from "./client";

export interface GoogleCalendarStatus {
  /** false when the server has no Google credentials — direct add is then simply unavailable. */
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  /** Ids of events this user already added (so the button can show "✓ Added"). */
  addedEventIds: string[];
}

export const getGoogleCalendarStatus = () => api.get<GoogleCalendarStatus>("/calendar/google/status");

/** Asks the server for the Google consent URL. Connecting creates NO event. */
export const startGoogleCalendarConnect = (returnTo: "/news" | "/dashboard" | "/settings") =>
  api.post<{ authUrl: string }>("/calendar/google/connect", { returnTo });

/** Creates ONE event — call only from a user's click on that event's button. */
export const addEventToGoogleCalendar = (eventId: string) =>
  api.post<{ status: "added" | "already_added"; htmlLink: string | null }>(`/calendar/google/events/${encodeURIComponent(eventId)}`);

/** Revokes Google's authorization and deletes the stored connection. Events already in the calendar stay. */
export const disconnectGoogleCalendar = () => api.delete<void>("/calendar/google");
