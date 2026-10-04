import { LabelStatus, OutcomeEventSource, StartupOutcomeEventType } from "../../common/enums";
import { regulatoryProgressionLabel } from "./regulatory-progression";
import type { StartupOutcomeEvent } from "../outcome-event.entity";

const SNAPSHOT_AT = new Date("2026-09-28T00:00:00.000Z");

function event(over: Partial<StartupOutcomeEvent>): StartupOutcomeEvent {
  return {
    id: "e1", createdAt: new Date(), updatedAt: new Date(), startupId: "s1",
    eventType: StartupOutcomeEventType.REGULATORY_MILESTONE, eventDate: "2027-01-01",
    source: OutcomeEventSource.ADMIN_ENTERED, verified: false,
    ...over,
  } as StartupOutcomeEvent;
}

describe("regulatoryProgressionLabel", () => {
  it("picks the ladder by the startup's own category, matching regulatory.engine.ts's pathway selection", () => {
    const now = new Date("2027-01-01T00:00:00.000Z"); // within window
    const events = [event({ eventDate: "2026-12-01", valueText: "submission preparation" })];
    // "Digital Health" -> digital-health ladder; "strategy prepared" is an earlier stage on that ladder.
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", events, SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });

  it("confirms advancement as soon as a qualifying event is found, even before the window elapses", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const events = [event({ eventDate: "2026-10-10", valueText: "SFDA submission" })];
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", events, SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(true);
  });

  it("is NOT_MATURED before the window elapses when no advancing event has occurred yet", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", [], SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.NOT_MATURED);
  });

  it("confirms no-advancement only once the window has fully elapsed", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const events = [event({ eventDate: "2026-10-01", valueText: "strategy prepared" })]; // same stage, not an advance
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", events, SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(false);
  });

  it("treats an unrecognized/missing baseline milestone as stage -1, so any recognized event counts as an advance", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const events = [event({ eventDate: "2026-10-01", valueText: "applicability assessed" })];
    const r = regulatoryProgressionLabel("Digital Health", undefined, events, SNAPSHOT_AT, 12, now);
    expect(r.valueBoolean).toBe(true);
  });

  it("uses the medical device ladder for a MedTech category, never comparing against the digital health ladder", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    // "ISO 13485" only exists on the medical device ladder, not digital health's.
    const events = [event({ eventDate: "2026-10-01", valueText: "ISO 13485" })];
    const r = regulatoryProgressionLabel("MedTech", "device classification", events, SNAPSHOT_AT, 12, now);
    expect(r.valueBoolean).toBe(true);
  });

  it("ignores an event whose milestone text doesn't match any stage on the ladder", () => {
    const now = new Date("2027-09-29T00:00:00.000Z");
    const events = [event({ eventDate: "2026-10-01", valueText: "some unrelated free text" })];
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", events, SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.AVAILABLE);
    expect(r.valueBoolean).toBe(false);
  });

  it("only counts REGULATORY_MILESTONE/REGULATORY_APPROVAL events, not unrelated event types", () => {
    const now = new Date("2027-01-01T00:00:00.000Z");
    const events = [event({ eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2026-10-01", valueText: "SFDA submission" })];
    const r = regulatoryProgressionLabel("Digital Health", "strategy prepared", events, SNAPSHOT_AT, 12, now);
    expect(r.status).toBe(LabelStatus.NOT_MATURED);
  });
});
