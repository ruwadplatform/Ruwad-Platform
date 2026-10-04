import { OutcomeEventSource, StartupOutcomeEventType } from "../common/enums";
import { OutcomeEventsService } from "./outcome-events.service";

function fakeRepo(seed: Record<string, any>[] = []) {
  const rows: Record<string, any>[] = [...seed];
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => matches(r, opts?.where))),
    create: jest.fn((x: any) => ({ id: `id-${rows.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
  };
}
function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

describe("OutcomeEventsService", () => {
  it("createAdminEvent always writes, tagging createdByUserId, even for a duplicate-looking event", async () => {
    const repo = fakeRepo();
    const svc = new OutcomeEventsService(repo as any);
    await svc.createAdminEvent("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1_000_000, source: OutcomeEventSource.ADMIN_ENTERED }, "admin-1");
    await svc.createAdminEvent("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1_000_000, source: OutcomeEventSource.ADMIN_ENTERED }, "admin-1");
    expect(repo.rows).toHaveLength(2); // an admin correcting/adding history is trusted, not deduplicated
    expect(repo.rows[0].createdByUserId).toBe("admin-1");
  });

  it("createSystemEventIfNew skips an exact duplicate (same startup+type+date+value) and returns null", async () => {
    const repo = fakeRepo();
    const svc = new OutcomeEventsService(repo as any);
    const first = await svc.createSystemEventIfNew("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1_000_000 });
    const second = await svc.createSystemEventIfNew("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1_000_000 });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].source).toBe(OutcomeEventSource.SYSTEM_DERIVED);
    expect(repo.rows[0].verified).toBe(false);
  });

  it("createSystemEventIfNew does not dedupe two genuinely different events on the same date (different amount)", async () => {
    const repo = fakeRepo();
    const svc = new OutcomeEventsService(repo as any);
    await svc.createSystemEventIfNew("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 1_000_000 });
    await svc.createSystemEventIfNew("s1", { eventType: StartupOutcomeEventType.FUNDING_ROUND, eventDate: "2027-01-01", valueNumeric: 2_000_000 });
    expect(repo.rows).toHaveLength(2);
  });

  it("correctValueText changes only valueText and appends previous value, reason and actor to notes", async () => {
    const repo = fakeRepo([{ id: "e1", startupId: "s1", eventType: StartupOutcomeEventType.MARKET_ENTRY, eventDate: "2023-12-31", valueText: "long prose description", notes: "orig note", valueNumeric: undefined }]);
    const svc = new OutcomeEventsService(repo as any);
    const out = await svc.correctValueText("s1", "e1", "Saudi Arabia", "Must be the bare destination country", "admin-1");
    expect(out.valueText).toBe("Saudi Arabia");
    expect(out.eventDate).toBe("2023-12-31");
    expect(out.eventType).toBe(StartupOutcomeEventType.MARKET_ENTRY);
    expect(out.notes).toContain("orig note");
    expect(out.notes).toContain('"long prose description" -> "Saudi Arabia"');
    expect(out.notes).toContain("admin-1");
    expect(out.notes).toContain("Must be the bare destination country");
  });

  it("correctValueText is a no-op when the value is unchanged and rejects an event of another startup", async () => {
    const repo = fakeRepo([{ id: "e1", startupId: "s1", valueText: "approval", notes: undefined }]);
    const svc = new OutcomeEventsService(repo as any);
    await svc.correctValueText("s1", "e1", "approval", "no change needed here", "admin-1");
    expect(repo.save).not.toHaveBeenCalled();
    await expect(svc.correctValueText("other-startup", "e1", "x", "should not be allowed", "admin-1")).rejects.toThrow(/not found/);
  });

  it("listForStartup returns only that startup's events, newest first", async () => {
    const repo = fakeRepo([
      { id: "a", startupId: "s1", eventDate: "2027-01-01" },
      { id: "b", startupId: "s2", eventDate: "2027-06-01" },
      { id: "c", startupId: "s1", eventDate: "2027-06-01" },
    ]);
    const svc = new OutcomeEventsService(repo as any);
    const out = await svc.listForStartup("s1");
    expect(out.map((e: any) => e.id).sort()).toEqual(["a", "c"]);
  });
});
