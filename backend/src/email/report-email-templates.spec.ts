import { ConfigService } from "@nestjs/config";
import { EmailService } from "./email.service";
import { reportPublishedTemplate, reportRejectedTemplate, reportSubmissionReviewTemplate } from "./email-templates";

const base = {
  title: "Saudi Digital Health Market Report 2026", reportType: "Market Intelligence", sector: "Digital Health", geography: "Saudi Arabia", authorName: "Sara Khalid",
  organizationName: "Example Org", authorEmail: "sara@example.com", submittedAt: "24 September 2026", executiveSummary: "A summary of the market.",
  reviewUrl: "https://app.test/report-review/TOKEN", acceptUrl: "https://app.test/report-review/TOKEN?action=accept", rejectUrl: "https://app.test/report-review/TOKEN?action=reject",
  reportUrl: "https://example.org/r.pdf", hasFile: false, sources: [{ title: "WHO report", url: "https://who.int/x" }],
};

describe("report publication request email", () => {
  it("contains the report details, sources, and separate Accept and Reject buttons", () => {
    const html = reportSubmissionReviewTemplate(base);
    for (const s of ["Saudi Digital Health Market Report 2026", "Market Intelligence", "Digital Health", "Saudi Arabia", "Sara Khalid", "Example Org", "sara@example.com", "24 September 2026", "A summary of the market.", "WHO report"]) expect(html).toContain(s);
    expect(html).toContain('href="https://app.test/report-review/TOKEN?action=accept"');
    expect(html).toContain('href="https://app.test/report-review/TOKEN?action=reject"');
    expect(html).toMatch(/>Accept Report</);
    expect(html).toMatch(/>Reject Report</);
    expect(html).toContain("Nothing changes until you press Confirm");
  });

  it("escapes user-entered text so it cannot inject markup", () => {
    const html = reportSubmissionReviewTemplate({ ...base, title: '<script>alert(1)</script>', authorName: '"><img src=x onerror=1>', executiveSummary: "<b>bold</b>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("only links http(s) URLs", () => {
    const html = reportSubmissionReviewTemplate({ ...base, reportUrl: "javascript:alert(1)", sources: [{ title: "Bad", url: "javascript:alert(1)" }, { title: "Data", url: "data:text/html,x" }, { title: "Good", url: "https://good.org/a" }] });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    expect(html).toContain('href="https://good.org/a"');
  });
});

describe("requester emails", () => {
  it("the published email names the report and links to it", () => {
    const html = reportPublishedTemplate({ firstName: "Sara", title: "My Report", reportUrl: "https://app.test/reports/my-report" });
    expect(html).toContain("My Report");
    expect(html).toContain("has been approved and is now available on RUWĀD");
    expect(html).toContain('href="https://app.test/reports/my-report"');
  });

  it("the rejection email shows the reason only when there is one", () => {
    expect(reportRejectedTemplate({ firstName: "Sara", title: "My Report", reason: "Out of <scope>" })).toContain("Out of &lt;scope&gt;");
    const none = reportRejectedTemplate({ firstName: "Sara", title: "My Report" });
    expect(none).toContain("was not approved for publication");
    expect(none).not.toContain("Reason:");
  });
});

describe("EmailService report methods", () => {
  const make = (env: Record<string, string>) => new EmailService(new ConfigService(env));
  const args = { token: "T".repeat(43), title: "Line one\nLine two", reportType: "Other", sector: "Other", geography: "Global", authorName: "A", organizationName: "O", authorEmail: "a@b.co", submittedAt: new Date(), executiveSummary: "s", hasFile: false, sources: [] };

  it("reports failure (false) rather than throwing when email is not configured, so the request stays pending", async () => {
    await expect(make({ ADMIN_NOTIFICATION_EMAIL: "ruwadplatform@gmail.com" }).sendReportSubmissionReview(args)).resolves.toBe(false);
    await expect(make({}).sendReportSubmissionReview(args)).resolves.toBe(false);
    await expect(make({ ADMIN_NOTIFICATION_EMAIL: "x@y.z" }).sendReportPublished({ to: "u@x.y", firstName: "A", title: "T", slug: "t" })).resolves.toBe(false);
  });

  it("sends the request to the notification address with a one-line subject and the token only in the links", async () => {
    const svc = make({ RESEND_API_KEY: "re_test", EMAIL_FROM: "RUWĀD <a@b.co>", ADMIN_NOTIFICATION_EMAIL: "ruwadplatform@gmail.com", APP_URL: "https://app.test/" });
    const send = jest.fn(async () => ({ data: {}, error: null }));
    (svc as unknown as { client: unknown }).client = { emails: { send } };
    await expect(svc.sendReportSubmissionReview(args)).resolves.toBe(true);
    const call = (send.mock.calls[0] as unknown as [{ to: string; subject: string; html: string }])[0];
    expect(call.to).toBe("ruwadplatform@gmail.com");
    expect(call.subject).toBe("New RUWĀD Report Publication Request — Line one Line two");
    expect(call.html).toContain(`https://app.test/report-review/${"T".repeat(43)}?action=accept`);
    expect(call.html).toContain(`https://app.test/report-review/${"T".repeat(43)}?action=reject`);
  });

  it("returns false when the provider rejects the message", async () => {
    const svc = make({ RESEND_API_KEY: "re_test", EMAIL_FROM: "RUWĀD <a@b.co>", ADMIN_NOTIFICATION_EMAIL: "ruwadplatform@gmail.com" });
    (svc as unknown as { client: unknown }).client = { emails: { send: async () => ({ data: null, error: { name: "validation_error", message: "bad" } }) } };
    await expect(svc.sendReportSubmissionReview(args)).resolves.toBe(false);
  });
});
