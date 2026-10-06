import { ConfigService } from "@nestjs/config";
import { EmailService } from "./email.service";
import { signEmailAction, verifyEmailAction } from "./email-action-token";
import { startupChangesCompletedTemplate } from "./email-templates";

const SECRET = "test-secret";

describe("email action tokens", () => {
  it("round-trip approve, reject and changes for the right submission", () => {
    for (const act of ["approve", "reject", "changes"] as const) {
      expect(verifyEmailAction(signEmailAction("sub-9", act, SECRET), SECRET)).toMatchObject({ sid: "sub-9", act });
    }
  });
  it("reject a tampered token and an unknown action", () => {
    const t = signEmailAction("sub-9", "changes", SECRET);
    expect(verifyEmailAction(t + "x", SECRET)).toBeNull();
    expect(verifyEmailAction(signEmailAction("sub-9", "approve", "other-secret"), SECRET)).toBeNull();
    expect(verifyEmailAction(signEmailAction("sub-9", "delete" as any, SECRET), SECRET)).toBeNull();
  });
});

describe("startupChangesCompletedTemplate", () => {
  const base = {
    startupName: "Acme Health", submitterName: "Sara A", submitterEmail: "sara@acme.example", submissionId: "sub-1", resubmittedAt: "October 6, 2026",
    requestedChanges: "Add the registration number.", payload: { name: "Acme Health", tagline: "Care" },
    approveUrl: "https://api/x?token=a", changesUrl: "https://api/x?token=c", rejectUrl: "https://api/x?token=r", reviewUrl: "https://app/admin/submissions/sub-1",
  };
  it("says the changes are done and offers Approve, Request changes and Reject, each to its own link", () => {
    const html = startupChangesCompletedTemplate(base);
    expect(html).toContain("Requested changes completed: Acme Health");
    expect(html).toContain("made the changes you requested");
    expect(html).toContain("Add the registration number.");
    expect(html).toContain('href="https://api/x?token=a"');
    expect(html).toContain('href="https://api/x?token=c"');
    expect(html).toContain('href="https://api/x?token=r"');
    for (const label of [">Approve<", ">Request changes<", ">Reject<"]) expect(html).toContain(label);
    expect(html).toContain("Approving publishes the startup");
    expect(html).toContain("https://app/admin/submissions/sub-1");
  });
  it("escapes user-entered text", () => {
    const html = startupChangesCompletedTemplate({ ...base, requestedChanges: "<script>alert(1)</script>", submitterName: "<b>x</b>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("EmailService.sendStartupChangesCompleted", () => {
  const config = (admin: string) => ({ get: (k: string) => ({ ADMIN_NOTIFICATION_EMAIL: admin, JWT_SECRET: SECRET, PUBLIC_API_URL: "https://api.example", APP_URL: "https://app.example" } as Record<string, string>)[k] }) as unknown as ConfigService;
  const args = { startupName: "Acme", submitterName: "Sara A", submitterEmail: "s@x.y", submissionId: "sub-1", resubmittedAt: new Date("2026-10-06"), requestedChanges: "Fix it", payload: { name: "Acme" } };

  it("sends to the admin notification address with three distinct signed links", async () => {
    const svc = new EmailService(config("ruwadplatform@gmail.com"));
    const send = jest.spyOn(svc as any, "send").mockResolvedValue(true);
    await svc.sendStartupChangesCompleted(args);
    expect(send).toHaveBeenCalledTimes(1);
    const [to, subject, html] = send.mock.calls[0] as [string, string, string];
    expect(to).toBe("ruwadplatform@gmail.com");
    expect(subject).toBe("Requested changes completed: Acme");
    const tokens = [...html.matchAll(/token=([A-Za-z0-9_.-]+)/g)].map((m) => verifyEmailAction(m[1], SECRET)?.act);
    expect(new Set(tokens)).toEqual(new Set(["approve", "changes", "reject"]));
    expect(html).toContain("https://api.example/api/email-actions/submission?token=");
    expect(html).toContain("https://app.example/admin/submissions/sub-1");
  });
  it("is skipped quietly when no admin address is configured", async () => {
    const svc = new EmailService(config(""));
    const send = jest.spyOn(svc as any, "send").mockResolvedValue(true);
    await expect(svc.sendStartupChangesCompleted(args)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
