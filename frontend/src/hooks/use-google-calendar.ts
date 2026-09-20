"use client";

/** Shared Google Calendar state for every "Add to Calendar" button on the page:
 * loaded once per page load, only for signed-in users, and read-only — loading
 * it never creates or changes anything in anyone's calendar. */
import { useEffect, useSyncExternalStore } from "react";
import { getGoogleCalendarStatus } from "@/lib/api/calendar";

export type ConnectResult = "connected" | "denied" | "email_mismatch" | "error";
export interface CalendarFlash { result: ConnectResult; eventId: string | null }

interface State {
  status: "idle" | "loading" | "ready" | "unavailable";
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  added: ReadonlySet<string>;
  /** Result of coming back from Google, waiting for the event's own button to show it. */
  flash: CalendarFlash | null;
}

const PENDING_KEY = "ruwad_gcal_pending";
const RESULTS: ConnectResult[] = ["connected", "denied", "email_mismatch", "error"];

let state: State = { status: "idle", configured: false, connected: false, needsReconnect: false, email: null, added: new Set(), flash: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

let urlFlash: CalendarFlash | null | undefined; // undefined = URL not read yet

/** Reads (once) the ?calendar=… result Google's round trip leaves in the URL, and removes it. */
export function readUrlFlash(): CalendarFlash | null {
  if (urlFlash !== undefined) return urlFlash;
  urlFlash = null;
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const r = url.searchParams.get("calendar") as ConnectResult | null;
    if (r && RESULTS.includes(r)) {
      let eventId: string | null = null;
      try { eventId = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
      urlFlash = { result: r, eventId };
    }
    if (url.searchParams.has("calendar")) {
      url.searchParams.delete("calendar");
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
    }
  } catch { /* leave as no flash */ }
  return urlFlash;
}

export function rememberPendingEvent(eventId: string) {
  try { sessionStorage.setItem(PENDING_KEY, eventId); } catch { /* storage unavailable */ }
}

export async function refreshGoogleCalendarStatus(): Promise<void> {
  try {
    const s = await getGoogleCalendarStatus();
    set({ status: s.configured ? "ready" : "unavailable", configured: s.configured, connected: s.connected, needsReconnect: s.needsReconnect, email: s.email, added: new Set(s.addedEventIds) });
  } catch {
    set({ status: "unavailable" }); // page keeps working with calendar links
  }
}

function ensureLoaded() {
  if (state.status !== "idle") return;
  set({ status: "loading", flash: readUrlFlash() });
  void refreshGoogleCalendarStatus();
}

export function markEventAdded(id: string) {
  set({ added: new Set([...state.added, id]) });
}

export function clearFlash() {
  if (state.flash) set({ flash: null });
}

export function useGoogleCalendar(loggedIn: boolean): State {
  useEffect(() => {
    if (loggedIn) ensureLoaded();
    else if (state.status !== "idle") set({ status: "idle", configured: false, connected: false, needsReconnect: false, email: null, added: new Set(), flash: null }); // signed out: forget the previous user
  }, [loggedIn]);
  return useSyncExternalStore(subscribe, () => state, () => state);
}
