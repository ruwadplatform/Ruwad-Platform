import { LabelStatus, MlSnapshotSource, OutcomeEventSource, StartupOutcomeEventType } from "../../common/enums";
import { getTarget } from "./target-registry";
import { LEGACY_LABEL_CONTEXT } from "./outcome-coverage";
import type { StartupMlFeatureSnapshot } from "../startup-ml-feature-snapshot.entity";
import type { StartupOutcomeEvent } from "../outcome-event.entity";

/** Exactly the scenario from the Phase 1C spec's local E2E test — a pure
 * unit-level version (no database) that pins down every formula precisely.
 * The full local E2E (submitting through the real API) additionally proves
 * the wiring end-to-end; this test proves the math. */
describe("Target registry — spec's exact worked example (Startup A)", () => {
  const snapshotAt = new Date("2026-09-28T00:00:00.000Z");
  const snapshot: StartupMlFeatureSnapshot = {
    id: "snap-a", startupId: "startup-a", snapshotAt, scoreVersion: "RUWAD-2.0", featureSchemaVersion: "ML-FEATURES-1.0",
    features: { annualRevenue: 2_000_000, customerCount: 50, runwayMonths: 12, totalFundingRaised: 5_000_000, founderExperienceYears: 10, regulatoryMilestone: "strategy prepared" },
    provenanceSummary: {}, dataConfidence: 0.7, scoreStatus: "CALCULATED", startupStage: "Seed", category: "Digital Health",
    snapshotSource: MlSnapshotSource.MATERIAL_CHANGE, reason: "test",
  } as StartupMlFeatureSnapshot;

  const events: StartupOutcomeEvent[] = [
    { id: "ev1", startupId: "startup-a", eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-05-28", valueNumeric: 8_000_000, source: OutcomeEventSource.ADMIN_ENTERED, verified: true } as StartupOutcomeEvent, // +8 months
    { id: "ev2", startupId: "startup-a", eventType: StartupOutcomeEventType.REVENUE_UPDATE, eventDate: "2027-09-28", valueNumeric: 3_000_000, source: OutcomeEventSource.ADMIN_ENTERED, verified: true } as StartupOutcomeEvent, // +12 months
    { id: "ev3", startupId: "startup-a", eventType: StartupOutcomeEventType.CUSTOMER_COUNT_UPDATE, eventDate: "2027-09-28", valueNumeric: 80, source: OutcomeEventSource.ADMIN_ENTERED, verified: true } as StartupOutcomeEvent, // +12 months
    { id: "ev4", startupId: "startup-a", eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, eventDate: "2027-07-28", valueText: "submission preparation", source: OutcomeEventSource.ADMIN_ENTERED, verified: true } as StartupOutcomeEvent, // +10 months
  ];

  const now = new Date("2027-09-29T00:00:00.000Z"); // just past the full 12-month window

  it("raisedNewRoundWithin12Months is true (funding round at +8 months)", () => {
    const r = getTarget("raisedNewRoundWithin12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });

  it("revenueGrowth12Months is 50% ((3,000,000 - 2,000,000) / 2,000,000 * 100)", () => {
    const r = getTarget("revenueGrowth12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueNumeric).toBeCloseTo(50, 5);
  });

  it("revenueGrowthAbove25Pct12Months and Above50Pct12Months are both true at exactly 50%", () => {
    expect(getTarget("revenueGrowthAbove25Pct12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT).valueBoolean).toBe(true);
    expect(getTarget("revenueGrowthAbove50Pct12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT).valueBoolean).toBe(true);
  });

  it("customerGrowth12Months is 60% ((80 - 50) / 50 * 100)", () => {
    const r = getTarget("customerGrowth12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueNumeric).toBeCloseTo(60, 5);
  });

  it("regulatoryMilestoneAdvancedWithin12Months is true (strategy prepared -> submission preparation, a later stage on the digital-health ladder)", () => {
    const r = getTarget("regulatoryMilestoneAdvancedWithin12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });

  it("amountRaisedNext12Months sums to exactly the one funding round in-window", () => {
    const r = getTarget("amountRaisedNext12Months")!.calculate(snapshot, events, now, LEGACY_LABEL_CONTEXT);
    expect(r.valueNumeric).toBe(8_000_000);
  });
});

describe("Target registry — spec's Startup B (sparse data, no mature outcomes)", () => {
  const snapshotAt = new Date("2026-09-28T00:00:00.000Z");
  const snapshot: StartupMlFeatureSnapshot = {
    id: "snap-b", startupId: "startup-b", snapshotAt, scoreVersion: "RUWAD-2.0", featureSchemaVersion: "ML-FEATURES-1.0",
    features: {}, provenanceSummary: {}, dataConfidence: undefined, scoreStatus: "INSUFFICIENT_DATA", startupStage: "Pre-Seed", category: "Digital Health",
    snapshotSource: MlSnapshotSource.MATERIAL_CHANGE, reason: "test",
  } as StartupMlFeatureSnapshot;

  it("every boolean target is NOT_MATURED shortly after the snapshot, never a fabricated false", () => {
    const soon = new Date("2026-11-01T00:00:00.000Z");
    for (const name of ["raisedNewRoundWithin12Months", "launchedCommerciallyWithin12Months", "activeAfter12Months"]) {
      expect(getTarget(name)!.calculate(snapshot, [], soon, LEGACY_LABEL_CONTEXT).status).toBe(LabelStatus.NOT_MATURED);
    }
  });

  it("revenue/customer growth targets are INSUFFICIENT_DATA (no baseline) regardless of maturity", () => {
    const later = new Date("2028-01-01T00:00:00.000Z");
    expect(getTarget("revenueGrowth12Months")!.calculate(snapshot, [], later, LEGACY_LABEL_CONTEXT).status).toBe(LabelStatus.INSUFFICIENT_DATA);
    expect(getTarget("customerGrowth12Months")!.calculate(snapshot, [], later, LEGACY_LABEL_CONTEXT).status).toBe(LabelStatus.INSUFFICIENT_DATA);
  });
});
