/** Time helpers for Advisory Services. Riyadh is UTC+3 all year (no daylight saving), so Riyadh wall-clock time is a fixed offset from UTC and
 * needs no time-zone database. Calendar dates are plain "YYYY-MM-DD" strings in Riyadh time. */

export const RIYADH_TZ = "Asia/Riyadh";
export const RIYADH_OFFSET_MINUTES = 3 * 60;
/** A slot that starts sooner than this from now is not offered. */
export const MIN_NOTICE_MINUTES = 120;
/** How far ahead a consultation can be booked. */
export const MAX_BOOKING_DAYS = 60;

export interface Ymd { y: number; m: number; d: number }

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const ymdKey = ({ y, m, d }: Ymd) => `${y}-${pad2(m)}-${pad2(d)}`;
export function parseYmd(key: string): Ymd {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Riyadh calendar date for an instant. */
export function riyadhDate(instant: Date): Ymd {
  const shifted = new Date(instant.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** Day of week (0 = Sunday) of a calendar date — the same in every time zone. */
export function weekdayOf({ y, m, d }: Ymd): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The instant a Riyadh date + "HH:MM" refers to. */
export function riyadhInstant(y: number, m: number, d: number, time: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - RIYADH_OFFSET_MINUTES * 60_000);
}

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
};
export const timeOf = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/** "10:00 AM" in the given IANA time zone. */
export function formatClock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone }).format(at);
}

/** "Monday, 26 October 2026" for a calendar date. */
export function formatLongDate(date: Ymd): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(date.y, date.m - 1, date.d)));
}

/** "UTC+3" / "UTC+5:30" for a zone at an instant. */
export function offsetLabel(at: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  return part.replace("GMT", "UTC");
}

/** "October 26, 2026" for a calendar date. */
export function formatDateUS(date: Ymd): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(date.y, date.m - 1, date.d)));
}

/** "October 2026" for a month. */
export function formatMonth(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "09:00 AM" for an "HH:MM" Riyadh wall-clock time (no zone conversion). */
export function formatWallClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${pad2(h! % 12 === 0 ? 12 : h! % 12)}:${pad2(m!)} ${h! < 12 ? "AM" : "PM"}`;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
