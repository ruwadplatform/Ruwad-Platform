import { LabelStatus, StartupOutcomeEventType } from "../../common/enums";
import type { StartupOutcomeEvent } from "../outcome-event.entity";
import { eventWithinWindow, isMatured, windowEnd } from "./observation-windows";
import { COVERAGE_UNATTESTED, INSUFFICIENT_DATA, LabelResult, NOT_MATURED } from "./label-types";
import { CoverageGate, coverageSupportsNegative } from "./outcome-coverage";

/** Every calculator below takes an optional `gate`. Without one (legacy V1
 * mode) behaviour is exactly what it always was. With one (V2 / training),
 * the absence of an event only becomes a result once the outcome family was
 * attested as checked through the end of the window — see outcome-coverage.ts. */

/** "Did a qualifying event happen within the window" — a POSITIVE can be
 * confirmed the moment a qualifying event is found, even before the window
 * fully elapses (per the exact definition: "snapshotAt < eventDate <=
 * snapshotAt + window" has no maturity precondition for the positive case),
 * and without any coverage attestation: a recorded event is evidence in
 * itself. A NEGATIVE can only be confirmed once the full window has elapsed
 * AND (V2) the outcome family was attested through the window's end. */
export function windowedEventBooleanLabel(snapshotAt: Date, events: StartupOutcomeEvent[], windowMonths: number, matches: (e: StartupOutcomeEvent) => boolean, now: Date, gate?: CoverageGate): LabelResult {
  const end = windowEnd(snapshotAt, windowMonths);
  const hit = events.some((e) => matches(e) && eventWithinWindow(e.eventDate, snapshotAt, end));
  if (hit) return { status: LabelStatus.AVAILABLE, valueBoolean: true };
  if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
  if (!coverageSupportsNegative(gate, snapshotAt, windowMonths)) return COVERAGE_UNATTESTED;
  return { status: LabelStatus.AVAILABLE, valueBoolean: false };
}

/** Percentage growth between a baseline value known at snapshot time and
 * the latest matching event's value within the window — gated on FULL
 * maturity before even looking for a future value (unlike the boolean
 * calculator above), since a partial early reading isn't a reliable
 * "growth over N months" figure the way an early positive event is a
 * reliable "did X happen" signal. In V2 it additionally needs coverage
 * through the window's end: "the latest value in the window" is only the
 * latest if the whole window was checked. `baseline` must already be the
 * normalized number from the snapshot's own features (e.g.
 * `snapshot.features.annualRevenue`), never re-read from a different
 * source. */
export function windowedGrowthLabel(snapshotAt: Date, baseline: number | undefined, events: StartupOutcomeEvent[], windowMonths: number, matches: (e: StartupOutcomeEvent) => boolean, now: Date, gate?: CoverageGate): LabelResult {
  if (baseline === undefined || !Number.isFinite(baseline) || baseline === 0) return INSUFFICIENT_DATA;
  if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
  if (!coverageSupportsNegative(gate, snapshotAt, windowMonths)) return COVERAGE_UNATTESTED;
  const end = windowEnd(snapshotAt, windowMonths);
  const inWindow = events.filter((e) => matches(e) && eventWithinWindow(e.eventDate, snapshotAt, end) && e.valueNumeric != null);
  if (!inWindow.length) return INSUFFICIENT_DATA;
  const latest = inWindow.reduce((a, b) => (new Date(a.eventDate).getTime() > new Date(b.eventDate).getTime() ? a : b));
  const growthPct = ((latest.valueNumeric! - baseline) / baseline) * 100;
  if (!Number.isFinite(growthPct)) return INSUFFICIENT_DATA;
  return { status: LabelStatus.AVAILABLE, valueNumeric: growthPct };
}

/** Boolean "did growth exceed threshold%" wrapper — reuses the numeric
 * calculator rather than re-implementing the maturity/baseline logic, so
 * the two can never drift out of sync. */
export function growthAboveThresholdLabel(numeric: LabelResult, thresholdPct: number): LabelResult {
  if (numeric.status !== LabelStatus.AVAILABLE || numeric.valueNumeric === undefined) return numeric;
  return { status: LabelStatus.AVAILABLE, valueBoolean: numeric.valueNumeric >= thresholdPct };
}

/** Sum of a numeric field (e.g. funding amount) across every matching
 * event in the window — gated on full maturity like the growth calculator,
 * since a mid-window partial sum isn't yet "the total for the next N
 * months." Zero is a legitimate, meaningful AVAILABLE result (raised
 * nothing), never confused with "no data" — but in V2 a total (zero
 * included) is only true if the whole window was checked. */
export function windowedSumLabel(snapshotAt: Date, events: StartupOutcomeEvent[], windowMonths: number, matches: (e: StartupOutcomeEvent) => boolean, now: Date, gate?: CoverageGate): LabelResult {
  if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
  if (!coverageSupportsNegative(gate, snapshotAt, windowMonths)) return COVERAGE_UNATTESTED;
  const end = windowEnd(snapshotAt, windowMonths);
  const sum = events
    .filter((e) => matches(e) && eventWithinWindow(e.eventDate, snapshotAt, end) && e.valueNumeric != null)
    .reduce((a, e) => a + (e.valueNumeric as number), 0);
  return { status: LabelStatus.AVAILABLE, valueNumeric: sum };
}

/** Only explicit, CONFIRMED SHUTDOWN evidence within the window counts as a
 * negative — silence (no recent update) is never treated as evidence of
 * failure, and neither is an unconfirmed status flag. In coverage-enforced
 * mode (V2) a shutdown event counts only if it is `verified` (confirmed,
 * dated evidence); an unverified one makes the label UNVERIFIED rather than
 * either "failed" or "still active", and "still active" itself needs
 * SURVIVAL coverage through the window's end. Legacy mode (no gate) keeps the
 * original behaviour so old numbers stay reproducible. */
export function survivalLabel(snapshotAt: Date, events: StartupOutcomeEvent[], windowMonths: number, now: Date, gate?: CoverageGate): LabelResult {
  const end = windowEnd(snapshotAt, windowMonths);
  const shutdowns = events.filter((e) => e.eventType === StartupOutcomeEventType.SHUTDOWN && eventWithinWindow(e.eventDate, snapshotAt, end));
  if (!gate) {
    if (shutdowns.length) return { status: LabelStatus.AVAILABLE, valueBoolean: false };
    if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
    return { status: LabelStatus.AVAILABLE, valueBoolean: true };
  }
  if (shutdowns.some((e) => e.verified)) return { status: LabelStatus.AVAILABLE, valueBoolean: false };
  if (shutdowns.length) return { status: LabelStatus.UNVERIFIED };
  if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
  if (!coverageSupportsNegative(gate, snapshotAt, windowMonths)) return COVERAGE_UNATTESTED;
  return { status: LabelStatus.AVAILABLE, valueBoolean: true };
}
