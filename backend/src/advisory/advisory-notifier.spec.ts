import { ConfigService } from "@nestjs/config";
import { AdvisoryNotifier, emailModeFrom, recipientsFor } from "./advisory-notifier";
import { AdvisoryAdvisor, AdvisoryBooking } from "./advisory.entities";
import { BookingStatus } from "./advisory.enums";

describe("email mode", () => {
  it("is mock unless the value is exactly 'live'", () => {
    expect(emailModeFrom(undefined)).toBe("mock");
    expect(emailModeFrom("")).toBe("mock");
    expect(emailModeFrom("mock")).toBe("mock");
    expect(emailModeFrom("true")).toBe("mock");
    expect(emailModeFrom("liv")).toBe("mock");
    expect(emailModeFrom("live")).toBe("live");
    expect(emailModeFrom(" LIVE ")).toBe("live");
  });
});

describe("who is told", () => {
  it("a new request tells the advisor and confirms to the founder", () => {
    expect(recipientsFor("REQUESTED", "FOUNDER").sort()).toEqual(["ADVISOR", "FOUNDER"]);
  });
  it("approval and rejection tell the founder only", () => {
    expect(recipientsFor("CONFIRMED", "ADVISOR")).toEqual(["FOUNDER"]);
    expect(recipientsFor("REJECTED", "ADVISOR")).toEqual(["FOUNDER"]);
  });
  it("a cancellation tells the other side, never the person who cancelled", () => {
    expect(recipientsFor("CANCELLED", "FOUNDER")).toEqual(["ADVISOR"]);
    expect(recipientsFor("CANCELLED", "ADVISOR")).toEqual(["FOUNDER"]);
    expect(recipientsFor("CANCELLED", "ADMIN").sort()).toEqual(["ADVISOR", "FOUNDER"]);
  });
  it("a reschedule proposal tells the party who must accept; acceptance tells both; a decline tells the proposer", () => {
    expect(recipientsFor("RESCHEDULE_PROPOSED", "FOUNDER", "FOUNDER")).toEqual(["ADVISOR"]);
    expect(recipientsFor("RESCHEDULE_PROPOSED", "ADVISOR", "ADVISOR")).toEqual(["FOUNDER"]);
    expect(recipientsFor("RESCHEDULE_ACCEPTED", "ADVISOR").sort()).toEqual(["ADVISOR", "FOUNDER"]);
    expect(recipientsFor("RESCHEDULE_DECLINED", "ADVISOR", "FOUNDER")).toEqual(["FOUNDER"]);
  });
});

function booking(over: Partial<AdvisoryBooking> = {}): AdvisoryBooking {
  return Object.assign(new AdvisoryBooking(), {
    id: "b1", reference: "ADV-TEST01", groupId: "b1", advisorId: "a1", serviceId: "s1", startupId: "st1", requestedByUserId: "u1", startsAt: new Date("2030-01-01T07:00:00Z"),
    endsAt: new Date("2030-01-01T07:30:00Z"), minutes: 30, serviceName: "Nanotechnology Consultation", serviceTypeId: "specialist", startupName: "Acme Health", status: BookingStatus.PENDING,
    isDemo: false, cancelReason: null, ...over,
  });
}

describe("who is told: the scheduler's emails", () => {
  it("an expired request tells both sides; the warning goes to the advisor only", () => {
    expect(recipientsFor("EXPIRED", "SYSTEM").sort()).toEqual(["ADVISOR", "FOUNDER"]);
    expect(recipientsFor("EXPIRY_WARNING", "SYSTEM")).toEqual(["ADVISOR"]);
  });
  it("reminders go to both sides", () => {
    expect(recipientsFor("REMINDER_24H", "SYSTEM").sort()).toEqual(["ADVISOR", "FOUNDER"]);
    expect(recipientsFor("REMINDER_1H", "SYSTEM").sort()).toEqual(["ADVISOR", "FOUNDER"]);
  });
  it("an expired reschedule proposal tells both sides; a needs-review prompt goes to the advisor", () => {
    expect(recipientsFor("RESCHEDULE_EXPIRED", "SYSTEM").sort()).toEqual(["ADVISOR", "FOUNDER"]);
    expect(recipientsFor("NEEDS_REVIEW", "SYSTEM")).toEqual(["ADVISOR"]);
  });
  it("every kind composes a subject and a body for each role it is sent to", () => {
    const n = new AdvisoryNotifier({ get: () => undefined } as unknown as ConfigService, {} as never, {} as never, {} as never, {} as never);
    const kinds = ["EXPIRED", "EXPIRY_WARNING", "REMINDER_24H", "REMINDER_1H", "RESCHEDULE_EXPIRED", "NEEDS_REVIEW"] as const;
    for (const kind of kinds) {
      for (const role of recipientsFor(kind, "SYSTEM")) {
        const { subject, html } = n.compose(kind, role, booking(), null, {});
        expect(subject.length).toBeGreaterThan(5);
        expect(html).toContain("RUWĀD");
      }
    }
  });
});

describe("AdvisoryNotifier never sends in mock mode and never emails a demonstration booking", () => {
  const build = (mode: string | undefined) => {
    const send = jest.fn().mockResolvedValue(true);
    const saved: unknown[] = [];
    const notifier = new AdvisoryNotifier(
      { get: (k: string) => (k === "ADVISORY_EMAIL_MODE" ? mode : undefined) } as unknown as ConfigService,
      { sendTransactional: send } as never,
      { findOne: jest.fn().mockResolvedValue({ id: "u1", email: "someone@example.test" }) } as never,
      { findOne: jest.fn().mockResolvedValue(Object.assign(new AdvisoryAdvisor(), { id: "a1", userId: "u2", name: "Dr. Real" })) } as never,
      { create: (x: unknown) => x, save: async (x: unknown) => { saved.push(x); return x; } } as never,
    );
    return { notifier, send, saved };
  };

  it("mock mode (the default) sends nothing and records what it would have done", async () => {
    const { notifier, send, saved } = build(undefined);
    await notifier.notify(booking(), "CONFIRMED", "ADVISOR");
    expect(send).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: "NOTIFICATION", actorRole: "SYSTEM", details: { kind: "CONFIRMED", mode: "mock", recipients: ["FOUNDER"] } });
  });

  it("a demonstration booking is never emailed, even in live mode", async () => {
    const { notifier, send, saved } = build("live");
    await notifier.notify(booking({ isDemo: true }), "REQUESTED", "FOUNDER");
    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(saved[0])).toContain("demonstration booking");
  });

  it("live mode does send for a real booking", async () => {
    const { notifier, send } = build("live");
    await notifier.notify(booking(), "CONFIRMED", "ADVISOR");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe("someone@example.test");
  });

  it("the audit record names roles, never email addresses", async () => {
    const { notifier, saved } = build("live");
    await notifier.notify(booking(), "CONFIRMED", "ADVISOR");
    expect(JSON.stringify(saved)).not.toContain("example.test");
  });

  it("a failing send can't throw into the booking action", async () => {
    const { notifier, send } = build("live");
    send.mockRejectedValue(new Error("provider down"));
    await expect(notifier.notify(booking(), "CONFIRMED", "ADVISOR")).resolves.toBeUndefined();
  });

  it("email content is escaped: a startup name can't inject markup", () => {
    const { notifier } = build(undefined);
    const { html } = notifier.compose("REQUESTED", "ADVISOR", booking({ startupName: `<script>alert(1)</script>` }), null, {});
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
