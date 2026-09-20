/** "Add to Calendar" for collected events. Everything is built from the
 * stored startDate/endDate (plain YYYY-MM-DD) and treated as ALL-DAY: no time
 * is ever invented. Calendar standards make the end of an all-day event
 * exclusive, so the day after the last day is used for DTEND / Google / Outlook. */
import { safeHttpUrl } from "@/lib/content-format";

export interface CalendarEvent {
  name: string;
  startDate: string;
  endDate?: string | null;
  description?: string | null;
  url?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  location?: string | null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/** ISO date + n days, as YYYY-MM-DD (done in UTC so DST never shifts it). */
export function addDaysIso(iso: string, n: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.toISOString().slice(0, 10);
}

const compact = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

function span(e: CalendarEvent): { start: string; lastDay: string; endExclusive: string } {
  const start = e.startDate.slice(0, 10);
  const last = e.endDate && e.endDate.slice(0, 10) >= start ? e.endDate.slice(0, 10) : start;
  return { start, lastDay: last, endExclusive: addDaysIso(last, 1) };
}

export function eventPlace(e: CalendarEvent): string {
  const parts = [e.venue, e.city, e.country].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : e.location ?? "";
}

/** Short description plus the original source link. */
export function eventNotes(e: CalendarEvent): string {
  const desc = (e.description ?? "").replace(/\s+/g, " ").trim();
  const short = desc.length > 300 ? desc.slice(0, 299).replace(/\s+\S*$/, "") + "…" : desc;
  const url = safeHttpUrl(e.url);
  return [short, url ? `Source: ${url}` : ""].filter(Boolean).join("\n\n");
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const { start, endExclusive } = span(e);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${compact(start)}/${compact(endExclusive)}`,
    details: eventNotes(e),
    location: eventPlace(e),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const { start, endExclusive } = span(e);
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.name,
    startdt: start,
    enddt: endExclusive,
    allday: "true",
    body: eventNotes(e),
    location: eventPlace(e),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Content lines are limited to 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ch; bytes = b; limit = 74; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: CalendarEvent, now = new Date()): string {
  const { start, endExclusive } = span(e);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const url = safeHttpUrl(e.url);
  const place = eventPlace(e);
  const uid = `${compact(start)}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}@ruwad`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RUWAD//News and Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${icsEscape(e.name)}`,
    `DTSTART;VALUE=DATE:${compact(start)}`,
    `DTEND;VALUE=DATE:${compact(endExclusive)}`,
    place ? `LOCATION:${icsEscape(place)}` : "",
    eventNotes(e) ? `DESCRIPTION:${icsEscape(eventNotes(e))}` : "",
    url ? `URL:${url}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function icsFileName(e: CalendarEvent): string {
  return `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"}.ics`;
}

/** Saves the .ics through a temporary link; opens in Apple Calendar / Outlook / any calendar app. */
export function downloadIcs(e: CalendarEvent): void {
  const blob = new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = icsFileName(e);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
