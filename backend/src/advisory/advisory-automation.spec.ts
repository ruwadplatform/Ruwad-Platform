import { computeExpiresAt, computeProposalExpiresAt, expiryWarningDue, reminderDue } from "./advisory-automation-rules";
import { readAutomationConfig } from "./advisory-config";

const H = 3_600_000;
const M = 60_000;
const at = (iso: string) => new Date(iso);
const cfg = { requestExpiryHours: 72, cutoffMinutes: 30 };

describe("request expiry: 72 hours, but before the consultation gets too close", () => {
  const made = at("2026-11-01T08:00:00Z");

  it("a consultation far away expires 72 hours after the request", () => {
    expect(computeExpiresAt(made, at("2026-11-20T08:00:00Z"), cfg)).toEqual(at("2026-11-04T08:00:00Z"));
  });

  it("a consultation sooner than that expires 30 minutes before it starts", () => {
    expect(computeExpiresAt(made, at("2026-11-02T08:00:00Z"), cfg)).toEqual(at("2026-11-02T07:30:00Z"));
  });

  it("a request made with the minimum two hours' notice still leaves 90 minutes to answer", () => {
    const start = new Date(made.getTime() + 2 * H);
    const expires = computeExpiresAt(made, start, cfg);
    expect(expires.getTime() - made.getTime()).toBe(90 * M);
  });

  it("the thresholds come from the config", () => {
    expect(computeExpiresAt(made, at("2026-11-20T08:00:00Z"), { requestExpiryHours: 24, cutoffMinutes: 60 })).toEqual(at("2026-11-02T08:00:00Z"));
  });

  it("a reschedule proposal also expires before the EARLIER of the original and the proposed time", () => {
    const original = at("2026-11-03T10:00:00Z");
    expect(computeProposalExpiresAt(made, original, at("2026-11-02T12:00:00Z"), cfg)).toEqual(at("2026-11-02T11:30:00Z")); // proposed is earlier
    expect(computeProposalExpiresAt(made, original, at("2026-11-10T12:00:00Z"), cfg)).toEqual(at("2026-11-03T09:30:00Z")); // original is earlier
  });
});

describe("the advisor's expiry warning", () => {
  const b = (over: Partial<Parameters<typeof expiryWarningDue>[0]> = {}) => ({ createdAt: at("2026-11-01T08:00:00Z"), expiresAt: at("2026-11-04T08:00:00Z"), expiryWarningSentAt: null, ...over });

  it("opens 24 hours before expiry and stays due until it expires", () => {
    expect(expiryWarningDue(b(), at("2026-11-03T07:59:00Z"), 24)).toBe(false);
    expect(expiryWarningDue(b(), at("2026-11-03T08:00:00Z"), 24)).toBe(true);
    expect(expiryWarningDue(b(), at("2026-11-04T07:59:00Z"), 24)).toBe(true);
    expect(expiryWarningDue(b(), at("2026-11-04T08:00:00Z"), 24)).toBe(false); // expired: no point warning
  });

  it("is sent once", () => {
    expect(expiryWarningDue(b({ expiryWarningSentAt: at("2026-11-03T09:00:00Z") }), at("2026-11-03T12:00:00Z"), 24)).toBe(false);
  });

  it("is skipped for a request that never lived 24 hours (made inside the warning window)", () => {
    expect(expiryWarningDue(b({ createdAt: at("2026-11-03T20:00:00Z") }), at("2026-11-03T21:00:00Z"), 24)).toBe(false);
  });

  it("is skipped when there is no expiry", () => {
    expect(expiryWarningDue(b({ expiresAt: null }), at("2026-11-03T12:00:00Z"), 24)).toBe(false);
  });
});

describe("reminders: 24 hours and 1 hour before a confirmed consultation", () => {
  const start = at("2026-11-10T10:00:00Z");
  const r = (over: Partial<Parameters<typeof reminderDue>[0]> = {}) => ({ startsAt: start, confirmedAt: at("2026-11-05T09:00:00Z"), sentAt: null, ...over });

  it("the 24-hour reminder is due from 24 hours before the start until the start", () => {
    expect(reminderDue(r(), 24, at("2026-11-09T09:59:00Z"))).toBe(false);
    expect(reminderDue(r(), 24, at("2026-11-09T10:00:00Z"))).toBe(true);
    expect(reminderDue(r(), 24, at("2026-11-10T09:59:00Z"))).toBe(true);
    expect(reminderDue(r(), 24, start)).toBe(false); // it has started
  });

  it("the 1-hour reminder is due from an hour before", () => {
    expect(reminderDue(r(), 1, at("2026-11-10T08:59:00Z"))).toBe(false);
    expect(reminderDue(r(), 1, at("2026-11-10T09:00:00Z"))).toBe(true);
  });

  it("each is sent once", () => {
    expect(reminderDue(r({ sentAt: at("2026-11-09T10:01:00Z") }), 24, at("2026-11-09T12:00:00Z"))).toBe(false);
  });

  it("a consultation confirmed after the reminder moment doesn't get that reminder", () => {
    const lateConfirm = r({ confirmedAt: at("2026-11-09T18:00:00Z") }); // confirmed 16 hours before
    expect(reminderDue(lateConfirm, 24, at("2026-11-09T19:00:00Z"))).toBe(false);
    expect(reminderDue(lateConfirm, 1, at("2026-11-10T09:00:00Z"))).toBe(true); // but the 1-hour one still comes
    const veryLate = r({ confirmedAt: at("2026-11-10T09:30:00Z") }); // confirmed 30 minutes before
    expect(reminderDue(veryLate, 1, at("2026-11-10T09:40:00Z"))).toBe(false);
  });
});

describe("automation settings: everything risky is off unless explicitly switched on", () => {
  const read = (env: Record<string, string>) => readAutomationConfig((k) => env[k]);

  it("defaults: scheduler off, auto-completion off, 72h expiry, 30 minute cutoff, 24h warning", () => {
    expect(read({})).toMatchObject({ schedulerEnabled: false, autoComplete: false, requestExpiryHours: 72, cutoffMinutes: 30, expiryWarningHours: 24, reminderHours: [24, 1] });
  });

  it("the scheduler needs BOTH ADVISORY_ENABLED and ADVISORY_SCHEDULER_ENABLED to be exactly 'true'", () => {
    expect(read({ ADVISORY_SCHEDULER_ENABLED: "true" }).schedulerEnabled).toBe(false);
    expect(read({ ADVISORY_ENABLED: "true" }).schedulerEnabled).toBe(false);
    expect(read({ ADVISORY_ENABLED: "true", ADVISORY_SCHEDULER_ENABLED: "yes" }).schedulerEnabled).toBe(false);
    expect(read({ ADVISORY_ENABLED: "true", ADVISORY_SCHEDULER_ENABLED: "true" }).schedulerEnabled).toBe(true);
  });

  it("auto-completion only turns on with exactly 'true'", () => {
    for (const v of ["", "1", "TRUE", "on", "false"]) expect(read({ ADVISORY_AUTOCOMPLETE_ENABLED: v }).autoComplete).toBe(false);
    expect(read({ ADVISORY_AUTOCOMPLETE_ENABLED: "true" }).autoComplete).toBe(true);
  });

  it("numbers are clamped and junk falls back to the default", () => {
    expect(read({ ADVISORY_REQUEST_EXPIRY_HOURS: "0" }).requestExpiryHours).toBe(1);
    expect(read({ ADVISORY_REQUEST_EXPIRY_HOURS: "100000" }).requestExpiryHours).toBe(24 * 14);
    expect(read({ ADVISORY_REQUEST_EXPIRY_HOURS: "soon" }).requestExpiryHours).toBe(72);
    expect(read({ ADVISORY_SCHEDULER_TICK_SECONDS: "1" }).tickMs).toBe(5000);
  });
});
