import { addMonths, windowEnd } from "../labels/observation-windows";

/** Pure planning safeguards for choosing historical snapshots. Nothing here
 * touches the database or the label engine: it decides WHICH snapshots are
 * worth building and whether their outcome windows can be trusted, so a
 * snapshot is never placed because of what happened after it. */

export type DensityClass = "RICH" | "ACCEPTABLE" | "SPARSE";
export const DENSITY_THRESHOLDS = { RICH: 4, ACCEPTABLE: 3 } as const;

/** RICH = >=4 of the six core features, ACCEPTABLE = 3, SPARSE = <=2. */
export function densityClassFor(coreFeatureCount: number): DensityClass {
  if (coreFeatureCount >= DENSITY_THRESHOLDS.RICH) return "RICH";
  if (coreFeatureCount >= DENSITY_THRESHOLDS.ACCEPTABLE) return "ACCEPTABLE";
  return "SPARSE";
}

const ORDER: Record<DensityClass, number> = { SPARSE: 0, ACCEPTABLE: 1, RICH: 2 };
export function meetsMinDensity(actual: DensityClass, minimum: "ACCEPTABLE" | "RICH"): boolean {
  return ORDER[actual] >= ORDER[minimum];
}

/** The only dates a FIXED_CALENDAR_GRID snapshot may use. */
export const GRID_MONTH_DAYS = ["06-30", "12-31"] as const;
export function isFixedGridDate(iso: string): boolean {
  return /^\d{4}-(06-30|12-31)$/.test(iso);
}

export function gridDatesBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const fromY = Number(fromIso.slice(0, 4)), toY = Number(toIso.slice(0, 4));
  for (let y = fromY; y <= toY; y++) for (const md of GRID_MONTH_DAYS) { const d = `${y}-${md}`; if (d >= fromIso && d <= toIso) out.push(d); }
  return out;
}

function monthIndex(iso: string): number { return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)); }

export interface GridSelectionOptions { maxPerCompany?: number; minGapMonths?: number }
export interface GridSelection { selected: string[]; rejected: { date: string; reason: string }[] }

/** Picks grid snapshots for one company. `existingDates` (snapshots the
 * company already has) count toward the per-company cap and the minimum
 * spacing. Candidates are considered oldest first and are never reordered by
 * any outcome. */
export function selectGridSnapshots(candidateDates: string[], existingDates: string[], opts: GridSelectionOptions = {}): GridSelection {
  const max = opts.maxPerCompany ?? 3, gap = opts.minGapMonths ?? 12;
  const kept = [...existingDates];
  const selected: string[] = [], rejected: GridSelection["rejected"] = [];
  for (const d of [...candidateDates].sort()) {
    if (!isFixedGridDate(d)) { rejected.push({ date: d, reason: "not a fixed calendar-grid date (June 30 / December 31)" }); continue; }
    if (kept.includes(d)) { rejected.push({ date: d, reason: "snapshot already exists for this date" }); continue; }
    if (kept.length >= max) { rejected.push({ date: d, reason: `company already has ${max} snapshots` }); continue; }
    if (kept.some((k) => Math.abs(monthIndex(k) - monthIndex(d)) < gap)) { rejected.push({ date: d, reason: `less than ${gap} months from another snapshot of this company` }); continue; }
    selected.push(d); kept.push(d);
  }
  return { selected, rejected };
}

export type WindowStatus = "POSITIVE_CONFIRMED" | "NEGATIVE_SUPPORTED" | "NOT_MATURED" | "COVERAGE_GAP";

/** Can the label for one outcome window be trusted?
 *
 * `outcomeCoverageThrough` means ONLY "outcome sources were checked through
 * this date". It does NOT mean "no event occurred". A window is a supported
 * negative only if it has fully elapsed AND the research coverage reaches the
 * window's end. A window the label engine would call negative from silence
 * alone (elapsed, but beyond coverage) is a COVERAGE_GAP and must not be
 * imported as if it were evidence of absence. */
export function windowStatus(snapshotIso: string, windowMonths: number, outcomeCoverageThrough: string | null | undefined, hasQualifyingEventInWindow: boolean, now: Date): WindowStatus {
  if (hasQualifyingEventInWindow) return "POSITIVE_CONFIRMED";
  const end = windowEnd(new Date(`${snapshotIso}T00:00:00Z`), windowMonths);
  if (now.getTime() < end.getTime()) return "NOT_MATURED"; // the label engine will not label it yet
  if (outcomeCoverageThrough && end.getTime() <= new Date(`${outcomeCoverageThrough}T00:00:00Z`).getTime()) return "NEGATIVE_SUPPORTED";
  return "COVERAGE_GAP";
}

/** A snapshot is safe to build when none of its 6/12/24-month windows is a COVERAGE_GAP. */
export function snapshotWindowsSafe(snapshotIso: string, outcomeCoverageThrough: string | null | undefined, eventDatesInWindow: { 6: boolean; 12: boolean; 24: boolean }, now: Date): { safe: boolean; statuses: Record<6 | 12 | 24, WindowStatus> } {
  const statuses = {
    6: windowStatus(snapshotIso, 6, outcomeCoverageThrough, eventDatesInWindow[6], now),
    12: windowStatus(snapshotIso, 12, outcomeCoverageThrough, eventDatesInWindow[12], now),
    24: windowStatus(snapshotIso, 24, outcomeCoverageThrough, eventDatesInWindow[24], now),
  } as Record<6 | 12 | 24, WindowStatus>;
  return { safe: !Object.values(statuses).includes("COVERAGE_GAP"), statuses };
}

export { addMonths };
