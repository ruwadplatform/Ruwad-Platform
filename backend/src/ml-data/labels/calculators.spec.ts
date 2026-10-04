import { LabelStatus, OutcomeEventSource, StartupOutcomeEventType } from "../../common/enums";
import { growthAboveThresholdLabel, survivalLabel, windowedEventBooleanLabel, windowedGrowthLabel, windowedSumLabel } from "./calculators";
import type { StartupOutcomeEvent } from "../outcome-event.entity";

const SNAPSHOT_AT = new Date("2026-09-28T00:00:00.000Z");

function event(over: Partial<StartupOutcomeEvent>): StartupOutcomeEvent {
  return {
    id: "e1", createdAt: new Date(), updatedAt: new Date(), startupId: "s1",
    eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01",
    source: OutcomeEventSource.ADMIN_ENTERED, verified: false,
    ...over,
  } as StartupOutcomeEvent;
}

const isFunding = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.FUNDING_ROUND;
const isRevenue = (e: StartupOutcomeEvent) => e.eventType === StartupOutcomeEventType.REVENUE_UPDATE;

describe("windowedEventBooleanLabel", () => {
  it("is NOT_MATURED before the window elapses with no qualifying event yet", () => {
    const now = new Date("2027-01-01T00:00:00.000Z"); // 3 months after snapshot, 12-month window
    const r = windowedEventBooleanLabel(SNAPSHOT_AT, [], 12, isFunding, now);
    expect(r.status).toBe(LabelStatus.NOT_MATURED);
    expect(r.valueBoolean).toBeUndefined();
  });

  it("confirms positive as soon as a qualifying event occurs, even before the window elapses", () => {
    const now = new Date("2027-01-01T00:00:00.000Z"); // still within the 12-month window
    const events = [event({ eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2026-12-01" })];
    const r = windowedEventBooleanLabel(SNAPSHOT_AT, events, 12, isFunding, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });

  it("confirms negative only once the full window has elapsed with no qualifying event", () => {
    const now = new Date("2027-09-29T00:00:00.000Z"); // just past 12 months
    const r = windowedEventBooleanLabel(SNAPSHOT_AT, [], 12, isFunding, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(false);
  });

  it("never counts an event dated before the snapshot or after the window end", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const events = [
      event({ eventDate: "2026-09-01" }), // before snapshot
      event({ eventDate: "2028-01-01" }), // after 12-month window
    ];
    const r = windowedEventBooleanLabel(SNAPSHOT_AT, events, 12, isFunding, now);
    expect(r.valueBoolean).toBe(false);
  });
});

describe("windowedGrowthLabel", () => {
  it("is INSUFFICIENT_DATA when the baseline is missing or zero, regardless of maturity", () => {
    const now = new Date("2028-01-01T00:00:00.000Z");
    expect(windowedGrowthLabel(SNAPSHOT_AT, undefined, [], 12, isRevenue, now).status).toBe(LabelStatus.INSUFFICIENT_DATA);
    expect(windowedGrowthLabel(SNAPSHOT_AT, 0, [], 12, isRevenue, now).status).toBe(LabelStatus.INSUFFICIENT_DATA);
  });

  it("is NOT_MATURED before the window elapses even if a baseline exists", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const r = windowedGrowthLabel(SNAPSHOT_AT, 2_000_000, [], 12, isRevenue, now);
    expect(r.status).toBe(LabelStatus.NOT_MATURED);
  });

  it("computes the exact growth formula from the latest in-window value once matured", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const events = [event({ eventType: StartupOutcomeEventType.REVENUE_UPDATE, eventDate: "2027-09-28", valueNumeric: 3_000_000 })];
    const r = windowedGrowthLabel(SNAPSHOT_AT, 2_000_000, events, 12, isRevenue, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueNumeric).toBeCloseTo(50, 5); // (3M - 2M) / 2M * 100
  });

  it("is INSUFFICIENT_DATA once matured if no future value was ever reported", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const r = windowedGrowthLabel(SNAPSHOT_AT, 2_000_000, [], 12, isRevenue, now);
    expect(r.status).toBe(LabelStatus.INSUFFICIENT_DATA);
  });

  it("picks the latest in-window value when multiple revenue updates exist", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const events = [
      event({ eventType: StartupOutcomeEventType.REVENUE_UPDATE, eventDate: "2027-01-01", valueNumeric: 2_500_000 }),
      event({ eventType: StartupOutcomeEventType.REVENUE_UPDATE, eventDate: "2027-09-01", valueNumeric: 3_000_000 }),
    ];
    const r = windowedGrowthLabel(SNAPSHOT_AT, 2_000_000, events, 12, isRevenue, now);
    expect(r.valueNumeric).toBeCloseTo(50, 5);
  });
});

describe("growthAboveThresholdLabel", () => {
  it("wraps a numeric result into a boolean without recomputing", () => {
    expect(growthAboveThresholdLabel({ status: LabelStatus.AVAILABLE, valueNumeric: 60 }, 50).valueBoolean).toBe(true);
    expect(growthAboveThresholdLabel({ status: LabelStatus.AVAILABLE, valueNumeric: 40 }, 50).valueBoolean).toBe(false);
  });
  it("passes through a non-AVAILABLE status unchanged (never fabricates a boolean from immature/insufficient data)", () => {
    expect(growthAboveThresholdLabel({ status: LabelStatus.NOT_MATURED }, 50).status).toBe(LabelStatus.NOT_MATURED);
    expect(growthAboveThresholdLabel({ status: LabelStatus.NOT_MATURED }, 50).valueBoolean).toBeUndefined();
  });
});

describe("windowedSumLabel", () => {
  it("is NOT_MATURED before the window elapses", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    expect(windowedSumLabel(SNAPSHOT_AT, [], 12, isFunding, now).status).toBe(LabelStatus.NOT_MATURED);
  });
  it("sums every qualifying in-window event once matured, 0 if none — a legitimate result, not missing data", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    expect(windowedSumLabel(SNAPSHOT_AT, [], 12, isFunding, now)).toEqual({ status: LabelStatus.AVAILABLE, valueNumeric: 0 });
    const events = [event({ eventDate: "2027-01-01", valueNumeric: 1_000_000 }), event({ eventDate: "2027-06-01", valueNumeric: 500_000 })];
    expect(windowedSumLabel(SNAPSHOT_AT, events, 12, isFunding, now).valueNumeric).toBe(1_500_000);
  });
});

describe("survivalLabel", () => {
  it("never infers inactivity from silence — stays NOT_MATURED with no evidence at all", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    expect(survivalLabel(SNAPSHOT_AT, [], 12, now).status).toBe(LabelStatus.NOT_MATURED);
  });
  it("defaults to true (active) once matured with no shutdown evidence", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const r = survivalLabel(SNAPSHOT_AT, [], 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });
  it("confirms false as soon as an explicit SHUTDOWN event is found, even before maturity", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const events = [event({ eventType: StartupOutcomeEventType.SHUTDOWN, eventDate: "2026-12-01" })];
    const r = survivalLabel(SNAPSHOT_AT, events, 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(false);
  });
});
