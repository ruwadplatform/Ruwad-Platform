/** Display helpers for collected news/events. Dates are plain YYYY-MM-DD
 * strings, formatted without going through Date-in-a-timezone so a date never
 * shifts by a day. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

/** "20–22 September 2026", "28 September – 2 October 2026", "15 October 2026". */
export function formatEventDates(start: string, end?: string | null): string {
  const s = parts(start);
  if (!s) return "";
  const e = end ? parts(end) : null;
  if (!e || (e.y === s.y && e.m === s.m && e.d === s.d)) return `${s.d} ${MONTHS[s.m - 1]} ${s.y}`;
  if (e.y === s.y && e.m === s.m) return `${s.d}–${e.d} ${MONTHS[s.m - 1]} ${s.y}`;
  if (e.y === s.y) return `${s.d} ${MONTHS[s.m - 1]} – ${e.d} ${MONTHS[e.m - 1]} ${s.y}`;
  return `${s.d} ${MONTHS[s.m - 1]} ${s.y} – ${e.d} ${MONTHS[e.m - 1]} ${e.y}`;
}

/** "18 Sep 2026" */
export function formatShortDate(iso: string): string {
  const p = parts(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1].slice(0, 3)} ${p.y}` : "";
}

export type EventStatus = "ONGOING" | "UPCOMING" | "PAST";

/** Same rule as the backend (start > today = upcoming, end < today = past),
 * evaluated in the viewer's local calendar day so a long-open tab stays right. */
export function eventStatusOf(start: string, end?: string | null, now = new Date()): EventStatus {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const e = end || start;
  if (e < today) return "PAST";
  if (start > today) return "UPCOMING";
  return "ONGOING";
}

/** Only ever link out to real web URLs (never javascript:/data: etc.). */
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try { const p = new URL(u); return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null; } catch { return null; }
}

const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Compact form for cards: "6 Oct 2026", "20–22 Oct 2026", "28 Sep – 2 Oct 2026". */
export function formatEventDatesShort(start: string, end?: string | null): string {
  const s = parts(start);
  if (!s) return "";
  const e = end ? parts(end) : null;
  if (!e || (e.y === s.y && e.m === s.m && e.d === s.d)) return `${s.d} ${SHORT[s.m - 1]} ${s.y}`;
  if (e.y === s.y && e.m === s.m) return `${s.d}–${e.d} ${SHORT[s.m - 1]} ${s.y}`;
  if (e.y === s.y) return `${s.d} ${SHORT[s.m - 1]} – ${e.d} ${SHORT[e.m - 1]} ${s.y}`;
  return `${s.d} ${SHORT[s.m - 1]} ${s.y} – ${e.d} ${SHORT[e.m - 1]} ${e.y}`;
}

/** ONGOING first, then UPCOMING by nearest start date. */
export function compareEvents(a: { startDate: string; endDate?: string | null }, b: { startDate: string; endDate?: string | null }): number {
  const rank = (x: typeof a) => (eventStatusOf(x.startDate, x.endDate) === "ONGOING" ? 0 : 1);
  return rank(a) - rank(b) || (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);
}
