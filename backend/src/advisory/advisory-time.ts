/** Time helpers for Advisory Services — the server-side twin of frontend/src/features/advisory/advisory-time.ts (kept in step by the shared test
 * cases in advisory-slots.spec.ts). Riyadh is UTC+3 all year with no daylight saving, so its wall-clock time is a fixed offset from UTC and needs
 * no time-zone database. Calendar dates are plain "YYYY-MM-DD" strings in Riyadh time; every instant crossing the API is an ISO-8601 UTC string. */

export const RIYADH_TZ = "Asia/Riyadh";
export const RIYADH_OFFSET_MINUTES = 3 * 60;
/** A slot that starts sooner than this from now is not offered. */
export const MIN_NOTICE_MINUTES = 120;
/** How far ahead a consultation can be booked. */
export const MAX_BOOKING_DAYS = 60;
/** Slots start on this grid inside an availability window. */
export const SLOT_STEP_MINUTES = 30;

export interface Ymd { y: number; m: number; d: number }

const pad2 = (n: number) => String(n).padStart(2, "0");
export const ymdKey = ({ y, m, d }: Ymd) => `${y}-${pad2(m)}-${pad2(d)}`;

export const YMD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Parses "YYYY-MM-DD"; null when it isn't a real calendar date (so "2026-02-31" is rejected rather than rolled over). */
export function parseYmd(key: string): Ymd | null {
  if (!YMD_PATTERN.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d ? { y, m, d } : null;
}

export function riyadhDate(instant: Date): Ymd {
  const shifted = new Date(instant.getTime() + RIYADH_OFFSET_MINUTES * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** Day of week (0 = Sunday) of a calendar date. */
export function weekdayOf({ y, m, d }: Ymd): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function daysBetween(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** The instant a Riyadh date + "HH:MM" refers to. */
export function riyadhInstant(date: Ymd, time: string): Date {
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(date.y, date.m - 1, date.d, hh, mm) - RIYADH_OFFSET_MINUTES * 60_000);
}

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
export const timeOf = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/** "Sunday, 26 October 2026, 10:00" in Riyadh time, for emails. */
export function formatRiyadh(at: Date): string {
  return `${new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: RIYADH_TZ }).format(at)} (Riyadh, UTC+3)`;
}
