import { ConfigService } from "@nestjs/config";
import { AdvisoryApplicationNotifier, DEFAULT_APPLICATIONS_INBOX, composeApprovalEmail, composeNewApplicationEmail, composeReapplicationEmail, composeRejectionEmail } from "./advisory-application-notifier";
import { AdvisoryAdvisor } from "./advisory.entities";

const facts = {
  id: "5b0a3a52-7c1e-4d8e-9d5b-0a1b2c3d4e5f", name: "Dr. Layla <b>Test</b>", email: "layla@example.com", phone: "+966 55 123 4567", institution: "King Test University",
  designation: "Professor of Cardiology", specialization: "Cardiology", yearsExperience: 14, submittedAt: new Date("2026-11-02T09:30:00Z"), reference: "ADV-2026-K7Q2MX",
};

describe("the email to RUWĀD about a new application", () => {
  const mail = composeNewApplicationEmail(facts, "https://app.ruwad.test");
  it("has the agreed subject", () => expect(mail.subject).toBe("New Advisor Application – RUWĀD Advisory Services"));
  it("lists the applicant's details and the reference", () => {
    for (const text of ["layla@example.com", "+966 55 123 4567", "King Test University", "Professor of Cardiology", "Cardiology", "14", "ADV-2026-K7Q2MX", "Submitted"]) expect(mail.html).toContain(text);
  });
  it("escapes what the applicant typed", () => {
    expect(mail.html).not.toContain("<b>Test</b>");
    expect(mail.html).toContain("Dr. Layla &lt;b&gt;Test&lt;/b&gt;");
  });
  it("links to the Admin Dashboard and tells the administrator to sign in", () => {
    expect(mail.html).toContain("https://app.ruwad.test/admin/advisory?application=5b0a3a52-7c1e-4d8e-9d5b-0a1b2c3d4e5f");
    expect(mail.html).toMatch(/log in to RUWĀD to review/i);
  });
  it("never links to, or attaches, a document", () => {
    const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(links).toEqual(["https://app.ruwad.test/admin/advisory?application=5b0a3a52-7c1e-4d8e-9d5b-0a1b2c3d4e5f"]);
    expect(mail.html).not.toMatch(/documents\/|\.pdf|download/i);
  });
});

describe("the email to RUWĀD about a resubmitted application", () => {
  const mail = composeReapplicationEmail(facts, 2, "We could not verify your licence.", "https://app.ruwad.test");
  it("has its own subject, so it is not mistaken for a first application", () => expect(mail.subject).toBe("Updated Advisor Application – RUWĀD Advisory Services"));
  it("says it is a resubmission, with the submission number and the earlier reason", () => {
    expect(mail.html).toMatch(/updated it and submitted it again/);
    for (const t of ["Submission number", "ADV-2026-K7Q2MX", "Previous rejection reason", "We could not verify your licence."]) expect(mail.html).toContain(t);
  });
  it("links only to the Admin Dashboard, never to a document", () => {
    expect([...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["https://app.ruwad.test/admin/advisory?application=5b0a3a52-7c1e-4d8e-9d5b-0a1b2c3d4e5f"]);
    expect(mail.html).not.toMatch(/documents\/|\.pdf|download/i);
  });
  it("escapes the earlier reason", () => {
    expect(composeReapplicationEmail(facts, 2, "<script>x</script>", "https://a").html).not.toContain("<script>x</script>");
  });
});

describe("the decision emails", () => {
  it("approval: agreed subject, the agreed wording, a link to the Advisor Dashboard", () => {
    const m = composeApprovalEmail("Dr. Layla", "https://app.ruwad.test");
    expect(m.subject).toBe("Your RUWĀD Advisor Application Has Been Approved");
    for (const line of [
      "Dear Dr. Layla,",
      "We are pleased to inform you that your application to join RUWĀD Advisory Services has been approved.",
      "You can now access your Advisor Dashboard, complete your professional profile, manage your consultation services, and configure your availability.",
      "We look forward to welcoming you to the RUWĀD advisory network.",
      "Best regards,",
      "RUWĀD Team",
    ]) expect(m.html).toContain(line);
    expect(m.html).toContain('href="https://app.ruwad.test/workspace/advisor"');
  });

  it("rejection: agreed subject, the agreed wording, and the administrator's reason", () => {
    const m = composeRejectionEmail("Dr. Layla", "We could not verify your clinical licence.\nPlease re-apply with a copy.");
    expect(m.subject).toBe("Update on Your RUWĀD Advisor Application");
    for (const line of [
      "Dear Dr. Layla,",
      "Thank you for your interest in joining RUWĀD Advisory Services.",
      "After reviewing your application, we regret to inform you that your application has not been approved at this time.",
      "Reason:",
      "We could not verify your clinical licence.<br/>Please re-apply with a copy.",
      "We appreciate your interest in RUWĀD and encourage you to contact our team if you have any questions.",
      "Best regards,",
      "RUWĀD Team",
    ]) expect(m.html).toContain(line);
  });

  it("rejection: the reason is escaped, so it can't inject markup or links", () => {
    const m = composeRejectionEmail("A", '<a href="https://evil.example">click</a>');
    expect(m.html).not.toContain('<a href="https://evil.example">');
    expect(m.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;");
  });
});

describe("delivery", () => {
  const advisor = (over: Partial<AdvisoryAdvisor> = {}) => ({ id: "adv-1", userId: "u-1", name: "Dr. Layla", contactEmail: "layla@example.com", phone: "+966 55 123 4567", institution: "KTU", designation: "Prof", specialization: "Cardiology", yearsExperience: 3, applicationReference: "ADV-2026-AAAAAA", submittedAt: new Date(), createdAt: new Date(), isDemo: false, ...over }) as AdvisoryAdvisor;
  function build(env: Record<string, string>, sendResult = true) {
    const saved: Record<string, unknown>[] = [];
    const send = jest.fn().mockResolvedValue(sendResult);
    const state: { rejectedEvent: { note: string } | null } = { rejectedEvent: null };
    const events = { create: (x: Record<string, unknown>) => x, save: jest.fn(async (x: Record<string, unknown>) => { saved.push(x); return x; }), findOne: jest.fn(async () => state.rejectedEvent) };
    const users = { findOne: jest.fn().mockResolvedValue({ id: "u-1", email: "account@example.com" }) };
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    const notifier = new AdvisoryApplicationNotifier(config, { sendTransactional: send } as never, users as never, events as never);
    return { notifier, send, saved, users, set rejectedEvent(v: { note: string } | null) { state.rejectedEvent = v; } };
  }

  it("sends to ruwadplatform@gmail.com by default", () => {
    expect(DEFAULT_APPLICATIONS_INBOX).toBe("ruwadplatform@gmail.com");
    expect(build({}).notifier.inbox).toBe("ruwadplatform@gmail.com");
  });

  it("MOCK mode (the default): nothing is sent, the attempt is recorded without any address", async () => {
    for (const env of [{} as Record<string, string>, { ADVISORY_EMAIL_MODE: "mock" }, { ADVISORY_EMAIL_MODE: "true" }, { ADVISORY_EMAIL_MODE: "liv" }]) {
      const { notifier, send, saved } = build(env);
      await notifier.newApplication(advisor());
      await notifier.approved(advisor());
      await notifier.rejected(advisor(), "Reason text here.");
      expect(send).not.toHaveBeenCalled();
      expect(saved.map((e) => (e.details as { kind: string }).kind)).toEqual(["ADMIN_NEW_APPLICATION", "APPLICANT_APPROVED", "APPLICANT_REJECTED"]);
      expect(saved.every((e) => (e.details as { result: string }).result === "mock")).toBe(true);
      expect(JSON.stringify(saved)).not.toContain("@");
    }
  });

  it("LIVE mode (only when exactly 'live'): the new-application mail goes to RUWĀD, decisions go to the applicant's form address", async () => {
    const { notifier, send, saved } = build({ ADVISORY_EMAIL_MODE: "live" });
    await notifier.newApplication(advisor());
    await notifier.approved(advisor());
    await notifier.rejected(advisor(), "Reason text here.");
    expect(send.mock.calls.map((c) => c[0])).toEqual(["ruwadplatform@gmail.com", "layla@example.com", "layla@example.com"]);
    expect(saved.every((e) => (e.details as { result: string }).result === "sent")).toBe(true);
  });

  it("falls back to the account address for a profile that predates the form", async () => {
    const { notifier, send } = build({ ADVISORY_EMAIL_MODE: "live" });
    await notifier.approved(advisor({ contactEmail: null }));
    expect(send.mock.calls[0]![0]).toBe("account@example.com");
  });

  it("a reapplication goes to RUWĀD's inbox (live, with a fake provider) and is recorded without addresses in mock mode", async () => {
    const live = build({ ADVISORY_EMAIL_MODE: "live" });
    live.rejectedEvent = { note: "Earlier reason." };
    await live.notifier.reapplication(advisor(), 2);
    expect(live.send.mock.calls[0]![0]).toBe("ruwadplatform@gmail.com");
    expect(live.send.mock.calls[0]![1]).toBe("Updated Advisor Application – RUWĀD Advisory Services");
    expect(live.send.mock.calls[0]![2]).toContain("Earlier reason.");
    const mock = build({});
    await mock.notifier.reapplication(advisor(), 2);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.saved[0]!.details).toMatchObject({ kind: "ADMIN_REAPPLICATION", mode: "mock", recipient: "ADMIN", result: "mock", subject: "Updated Advisor Application – RUWĀD Advisory Services" });
    expect(JSON.stringify(mock.saved)).not.toContain("@");
  });

  it("a provider failure is recorded and never thrown", async () => {
    const { notifier, saved } = build({ ADVISORY_EMAIL_MODE: "live" }, false);
    await expect(notifier.newApplication(advisor())).resolves.toBeUndefined();
    expect((saved[0]!.details as { result: string }).result).toBe("failed");
  });

  it("an exception inside delivery is swallowed too", async () => {
    const { notifier, send } = build({ ADVISORY_EMAIL_MODE: "live" });
    send.mockRejectedValue(new Error("network down"));
    await expect(notifier.rejected(advisor(), "Reason text here.")).resolves.toBeUndefined();
  });

  it("a demonstration profile is never emailed, even in live mode", async () => {
    const { notifier, send, saved } = build({ ADVISORY_EMAIL_MODE: "live" });
    await notifier.approved(advisor({ isDemo: true }));
    expect(send).not.toHaveBeenCalled();
    expect((saved[0]!.details as { result: string }).result).toBe("skipped");
  });

  it("the inbox can be overridden for testing", () => {
    expect(build({ ADVISORY_APPLICATIONS_EMAIL: "qa@example.test" }).notifier.inbox).toBe("qa@example.test");
    expect(build({ ADVISORY_APPLICATIONS_EMAIL: "  " }).notifier.inbox).toBe("ruwadplatform@gmail.com");
  });
});
