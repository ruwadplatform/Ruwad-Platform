import { densityClassFor, gridDatesBetween, isFixedGridDate, meetsMinDensity, selectGridSnapshots, snapshotWindowsSafe, windowStatus } from "./snapshot-planning";

describe("density classes", () => {
  it("RICH >=4, ACCEPTABLE 3, SPARSE <=2 core features", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(densityClassFor)).toEqual(["SPARSE", "SPARSE", "SPARSE", "ACCEPTABLE", "RICH", "RICH", "RICH"]);
  });
  it("meetsMinDensity orders SPARSE < ACCEPTABLE < RICH", () => {
    expect(meetsMinDensity("SPARSE", "ACCEPTABLE")).toBe(false);
    expect(meetsMinDensity("ACCEPTABLE", "ACCEPTABLE")).toBe(true);
    expect(meetsMinDensity("ACCEPTABLE", "RICH")).toBe(false);
    expect(meetsMinDensity("RICH", "RICH")).toBe(true);
  });
});

describe("fixed calendar grid", () => {
  it("only June 30 and December 31 are grid dates", () => {
    expect(isFixedGridDate("2022-06-30")).toBe(true);
    expect(isFixedGridDate("2022-12-31")).toBe(true);
    expect(isFixedGridDate("2022-03-31")).toBe(false);
    expect(isFixedGridDate("2021-10-16")).toBe(false); // e.g. a date chosen just before a known round
  });
  it("gridDatesBetween lists the grid inside a range", () => {
    expect(gridDatesBetween("2021-07-01", "2023-06-30")).toEqual(["2021-12-31", "2022-06-30", "2022-12-31", "2023-06-30"]);
  });
});

describe("selectGridSnapshots — spacing and cap", () => {
  it("keeps snapshots at least 12 months apart", () => {
    const r = selectGridSnapshots(["2021-06-30", "2021-12-31", "2022-06-30", "2022-12-31"], []);
    expect(r.selected).toEqual(["2021-06-30", "2022-06-30"]);
    expect(r.rejected.map((x) => x.date)).toEqual(["2021-12-31", "2022-12-31"]);
  });
  it("caps a company at 3 snapshots INCLUDING ones it already has", () => {
    const r = selectGridSnapshots(["2023-12-31", "2024-12-31", "2025-12-31"], ["2021-12-31", "2022-12-31"]);
    expect(r.selected).toEqual(["2023-12-31"]);
    expect(r.rejected.map((x) => x.reason).every((m) => /already has 3 snapshots/.test(m))).toBe(true);
  });
  it("counts an existing off-grid snapshot toward spacing, and rejects off-grid candidates", () => {
    const r = selectGridSnapshots(["2021-12-31", "2022-03-31", "2022-12-31"], ["2021-06-30"]);
    expect(r.selected).toEqual(["2022-12-31"]);
    expect(r.rejected.find((x) => x.date === "2022-03-31")!.reason).toMatch(/not a fixed calendar-grid/);
    expect(r.rejected.find((x) => x.date === "2021-12-31")!.reason).toMatch(/less than 12 months/);
  });
  it("is independent of candidate order (no outcome can reorder the choice)", () => {
    const a = selectGridSnapshots(["2022-12-31", "2020-12-31", "2021-12-31"], []);
    const b = selectGridSnapshots(["2020-12-31", "2021-12-31", "2022-12-31"], []);
    expect(a).toEqual(b);
  });
});

describe("outcome coverage attestation", () => {
  const now = new Date("2026-10-03T00:00:00Z");
  it("a known event inside the window is a confirmed positive regardless of coverage", () => {
    expect(windowStatus("2022-12-31", 12, null, true, now)).toBe("POSITIVE_CONFIRMED");
  });
  it("silence is a supported negative ONLY when the window elapsed AND coverage reaches its end", () => {
    expect(windowStatus("2022-12-31", 12, "2026-09-30", false, now)).toBe("NEGATIVE_SUPPORTED");
  });
  it("silence beyond the coverage date is a COVERAGE_GAP, not a negative", () => {
    expect(windowStatus("2022-12-31", 24, "2023-06-30", false, now)).toBe("COVERAGE_GAP");
    expect(windowStatus("2022-12-31", 12, null, false, now)).toBe("COVERAGE_GAP"); // no attestation at all
  });
  it("a window that has not elapsed is NOT_MATURED (the label engine will not label it)", () => {
    expect(windowStatus("2025-12-31", 24, "2026-09-30", false, now)).toBe("NOT_MATURED");
  });
  it("snapshotWindowsSafe fails if any window is a coverage gap", () => {
    const ok = snapshotWindowsSafe("2023-06-30", "2026-09-30", { 6: false, 12: false, 24: false }, now);
    expect(ok.safe).toBe(true);
    const gap = snapshotWindowsSafe("2023-06-30", "2024-06-30", { 6: false, 12: false, 24: false }, now);
    expect(gap.safe).toBe(false);
    expect(gap.statuses[24]).toBe("COVERAGE_GAP");
  });
});
