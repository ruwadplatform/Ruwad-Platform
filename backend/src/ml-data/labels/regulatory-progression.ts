import { LabelStatus, StartupOutcomeEventType } from "../../common/enums";
import { LADDERS, pathwayFor } from "../../scoring/engines/regulatory.engine";
import type { StartupOutcomeEvent } from "../outcome-event.entity";
import { eventWithinWindow, isMatured, windowEnd } from "./observation-windows";
import { COVERAGE_UNATTESTED, NOT_MATURED, LabelResult } from "./label-types";
import { CoverageGate, coverageSupportsNegative } from "./outcome-coverage";

function stageIndexFor(ladder: string[], milestone: string | undefined | null): number | null {
  if (!milestone) return null;
  const i = ladder.findIndex((s) => s.toLowerCase() === milestone.toLowerCase());
  return i >= 0 ? i : null;
}

/** Reuses the exact same pathway/ladder logic as regulatory.engine.ts (see
 * its exported `pathwayFor`/`LADDERS`) so a startup is never compared
 * against a different sector's regulatory pathway than the one its score
 * itself uses — but the label logic is otherwise fully independent of the
 * score: this compares ladder POSITIONS over time, the engine scores a
 * single position. A positive (advanced) verdict can be confirmed as soon
 * as a qualifying event is found, matching the boolean calculator's
 * positive-early / negative-only-after-maturity pattern. */
export function regulatoryProgressionLabel(category: string, baselineMilestone: string | undefined, events: StartupOutcomeEvent[], snapshotAt: Date, windowMonths: number, now: Date, gate?: CoverageGate): LabelResult {
  const ladder = LADDERS[pathwayFor(category)];
  const baselineIndex = stageIndexFor(ladder, baselineMilestone);
  const end = windowEnd(snapshotAt, windowMonths);

  const inWindow = events.filter((e) => (e.eventType === StartupOutcomeEventType.REGULATORY_MILESTONE || e.eventType === StartupOutcomeEventType.REGULATORY_APPROVAL) && eventWithinWindow(e.eventDate, snapshotAt, end));
  const advanced = inWindow.some((e) => {
    const idx = stageIndexFor(ladder, e.valueText);
    return idx != null && (baselineIndex == null || idx > baselineIndex);
  });
  if (advanced) return { status: LabelStatus.AVAILABLE, valueBoolean: true };
  if (!isMatured(snapshotAt, windowMonths, now)) return NOT_MATURED;
  if (!coverageSupportsNegative(gate, snapshotAt, windowMonths)) return COVERAGE_UNATTESTED;
  return { status: LabelStatus.AVAILABLE, valueBoolean: false };
}
