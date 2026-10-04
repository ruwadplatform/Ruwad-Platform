import { addMonths, eventWithinWindow, isMatured, windowEnd } from "./observation-windows";

describe("observation-windows", () => {
  it("addMonths advances by calendar months in UTC", () => {
    expect(addMonths(new Date("2026-09-28T00:00:00.000Z"), 12).toISOString()).toBe("2027-09-28T00:00:00.000Z");
    expect(addMonths(new Date("2026-09-28T00:00:00.000Z"), 6).toISOString()).toBe("2027-03-28T00:00:00.000Z");
  });

  it("isMatured is false right before the window ends and true exactly at/after it", () => {
    const snapshotAt = new Date("2026-09-28T00:00:00.000Z");
    const end = windowEnd(snapshotAt, 12);
    expect(isMatured(snapshotAt, 12, new Date(end.getTime() - 1))).toBe(false);
    expect(isMatured(snapshotAt, 12, end)).toBe(true);
    expect(isMatured(snapshotAt, 12, new Date(end.getTime() + 1))).toBe(true);
  });

  describe("eventWithinWindow — the one leakage-prevention check every calculator and the exporter share", () => {
    const snapshotAt = new Date("2026-09-28T00:00:00.000Z");
    const end = windowEnd(snapshotAt, 12); // 2027-09-28

    it("excludes an event dated exactly on the snapshot date (must be strictly after)", () => {
      expect(eventWithinWindow("2026-09-28", snapshotAt, end)).toBe(false);
    });
    it("includes an event dated exactly on the window end date (inclusive)", () => {
      expect(eventWithinWindow("2027-09-28", snapshotAt, end)).toBe(true);
    });
    it("excludes an event dated even one day after the window end — this is the leakage guard", () => {
      expect(eventWithinWindow("2027-09-29", snapshotAt, end)).toBe(false);
    });
    it("excludes an event dated before the snapshot entirely", () => {
      expect(eventWithinWindow("2025-01-01", snapshotAt, end)).toBe(false);
    });
    it("includes an event dated the day after the snapshot", () => {
      expect(eventWithinWindow("2026-09-29", snapshotAt, end)).toBe(true);
    });
  });
});
