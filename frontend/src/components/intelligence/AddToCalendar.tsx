"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "@/hooks/use-store";
import { clearFlash, markEventAdded, refreshGoogleCalendarStatus, rememberPendingEvent, useGoogleCalendar } from "@/hooks/use-google-calendar";
import { addEventToGoogleCalendar, startGoogleCalendarConnect } from "@/lib/api/calendar";
import { ApiError } from "@/lib/api/client";
import { downloadIcs, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from "@/lib/calendar";

type Panel = "none" | "connect" | "confirm" | "reconnect" | "mismatch" | "denied" | "connect-error" | "add-error" | "links";

const MSG_ADDED = "Event added to your Google Calendar.";
const MSG_CONNECT = "Connect Google Calendar to add events directly to your calendar.";
const MSG_RECONNECT = "Please reconnect your Google Calendar.";
const MSG_MISMATCH = "Please connect the Google account associated with your RUWĀD email address.";
const MSG_ADD_FAILED = "We couldn't add this event to your Google Calendar. Please try again.";

/** "Add to Calendar".
 *
 * Signed-in users (when Google Calendar is set up on the server) can add the
 * event straight to their Google Calendar — but ONLY by clicking this button on
 * this event. Opening the page, signing in, connecting Google or viewing an
 * event never creates anything. Everyone else, and anyone who prefers it, gets
 * the calendar links (Google, Outlook) and the .ics download. `variant="link"`
 * is the compact text form used in the dashboard widget. */
export function AddToCalendar({ event, variant = "button" }: { event: CalendarEvent & { id?: string }; variant?: "button" | "link" }) {
  const { loggedIn } = useSession();
  const g = useGoogleCalendar(loggedIn);
  const direct = loggedIn && g.status === "ready" && g.configured && !!event.id;
  const eventId = event.id;

  const [panel, setPanel] = useState<Panel>("none");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false); // blocks a second request while one is in flight
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const added = direct && !!eventId && g.added.has(eventId);

  useEffect(() => {
    if (panel === "none") return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setPanel("none"); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel("none"); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [panel]);

  // Coming back from Google: show what happened on the event the user clicked. This only DISPLAYS a
  // result and, after a successful connection, asks — it never adds the event by itself.
  useEffect(() => {
    if (!g.flash || !eventId || g.flash.eventId !== eventId) return;
    const r = g.flash.result;
    if (r === "connected" && g.status !== "ready") return; // wait for the fresh connection status
    const next: Panel = r === "connected" ? (g.added.has(eventId) ? "none" : "confirm") : r === "email_mismatch" ? "mismatch" : r === "denied" ? "denied" : "connect-error";
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      clearFlash();
      setPanel(next);
      root.current?.scrollIntoView({ block: "center", behavior: "smooth" }); // back at the event the user clicked
    });
    return () => { cancelled = true; };
  }, [g.flash, g.added, g.status, eventId]);

  async function connect() {
    if (!eventId || busy.current) return;
    busy.current = true;
    try {
      rememberPendingEvent(eventId);
      const { authUrl } = await startGoogleCalendarConnect(window.location.pathname.startsWith("/dashboard") ? "/dashboard" : "/news");
      window.location.assign(authUrl);
    } catch {
      setPanel("connect-error");
      busy.current = false;
    }
  }

  async function add() {
    if (!eventId || busy.current) return;
    busy.current = true;
    setAdding(true);
    setNote(null);
    setPanel("none");
    try {
      await addEventToGoogleCalendar(eventId); // "added" and "already_added" both mean it's in the calendar
      markEventAdded(eventId);
      setNote(MSG_ADDED);
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      if (code === "not_connected") { void refreshGoogleCalendarStatus(); setPanel("connect"); }
      else if (code === "reconnect_required") { void refreshGoogleCalendarStatus(); setPanel("reconnect"); }
      else if (code === "event_ended") { setNote("This event has already ended."); }
      else setPanel("add-error");
    } finally {
      busy.current = false;
      setAdding(false);
    }
  }

  function onMainClick() {
    if (!direct) { setPanel(panel === "links" ? "none" : "links"); return; }
    if (adding) return;
    if (added) { setNote(MSG_ADDED); return; } // already there — never a second copy
    if (g.needsReconnect) { setPanel("reconnect"); return; }
    if (!g.connected) { setPanel("connect"); return; }
    void add();
  }

  const label = adding ? "Adding..." : added ? "✓ Added to Calendar" : "+ Add to Calendar";
  const external = { target: "_blank", rel: "noopener noreferrer", role: "menuitem", onClick: () => setPanel("none") } as const;

  const links = (
    <>
      <a href={googleCalendarUrl(event)} {...external}>Open in Google Calendar</a>
      <a href={outlookCalendarUrl(event)} {...external}>Outlook</a>
      <button type="button" role="menuitem" onClick={() => { downloadIcs(event); setPanel("none"); }}>Apple / iCal (.ics)</button>
    </>
  );
  const askLinks = <button type="button" className="btn btn-outline btn-sm" onClick={() => setPanel("links")}>Use Calendar Link Instead</button>;
  const connectBtn = (text: string) => <button type="button" className="btn btn-primary btn-sm" onClick={() => void connect()}>{text}</button>;

  let content: React.ReactNode = null;
  if (panel === "links") content = <div className="cal-items" role="menu" aria-label={`Add ${event.name} to your calendar`}>{links}</div>;
  else if (panel === "connect") content = <><p>{MSG_CONNECT}</p><div className="cal-actions">{connectBtn("Connect Google Calendar")}{askLinks}</div></>;
  else if (panel === "reconnect") content = <><p>{MSG_RECONNECT}</p><div className="cal-actions">{connectBtn("Reconnect Google Calendar")}{askLinks}</div></>;
  else if (panel === "mismatch") content = <><p>{MSG_MISMATCH}</p><div className="cal-actions">{connectBtn("Try again")}{askLinks}</div></>;
  else if (panel === "denied") content = <><p>Google Calendar wasn&apos;t connected. You can still add this event with a calendar link.</p><div className="cal-actions">{connectBtn("Connect Google Calendar")}{askLinks}</div></>;
  else if (panel === "connect-error") content = <><p>We couldn&apos;t connect Google Calendar. Please try again.</p><div className="cal-actions">{connectBtn("Try again")}{askLinks}</div></>;
  else if (panel === "add-error") content = <><p>{MSG_ADD_FAILED}</p><div className="cal-actions"><button type="button" className="btn btn-primary btn-sm" onClick={() => void add()}>Try again</button>{askLinks}</div></>;
  else if (panel === "confirm") content = (
    <>
      <p>Google Calendar connected. Add &ldquo;{event.name}&rdquo; to your calendar?</p>
      <div className="cal-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()}>+ Add to Calendar</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPanel("none")}>Not now</button>
      </div>
    </>
  );

  return (
    <div className={`cal-wrap${variant === "link" ? " cal-wrap-link" : ""}`} ref={root}>
      <button
        type="button"
        className={`${variant === "link" ? "ev-link cal-link" : "btn btn-outline btn-sm cal-btn"}${added ? " cal-added" : ""}`}
        aria-haspopup={direct ? undefined : "menu"}
        aria-expanded={panel !== "none"}
        aria-controls={panel !== "none" ? menuId : undefined}
        aria-busy={adding}
        disabled={adding}
        onClick={onMainClick}
      >
        {label}
      </button>
      {note && <div className="cal-note" role="status">{note}</div>}
      {content && <div className="cal-menu cal-panel" id={menuId} role={panel === "links" ? undefined : "dialog"} aria-label="Add to calendar">{content}</div>}
    </div>
  );
}
