import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, GoneException, NotFoundException } from "@nestjs/common";
import { FindOperator } from "typeorm";
import { ReportSubmissionsService, chooseCategory, looksLikePdf, normalizePublicationDate, safeFileName } from "./report-submissions.service";
import { ReportFile } from "./report-file.entity";
import { ReportReviewToken } from "./report-review-token.entity";
import { ReportSubmission } from "./report-submission.entity";
import { Report } from "./report.entity";
import { hashReviewToken } from "./review-token";
import type { SubmitReportDto } from "./dto/submit-report.dto";

const matches = (row: Record<string, any>, where: Record<string, any>) =>
  Object.entries(where).every(([k, v]) => (v instanceof FindOperator ? (v as any).type === "isNull" && (row[k] === null || row[k] === undefined) : row[k] === v));

class FakeRepo {
  rows: Record<string, any>[] = [];
  constructor(private readonly key: string, private readonly unique?: string[]) {}
  create = (o: object) => ({ ...o });
  save = async (o: Record<string, any>) => {
    if (!o.id) {
      if (this.unique && this.rows.some((r) => this.unique!.every((k) => r[k] === o[k]))) throw Object.assign(new Error("duplicate"), { code: "23505" });
      o.id = randomUUID(); o.createdAt = new Date(); this.rows.push(o);
    }
    return o;
  };
  findOne = async ({ where }: { where: Record<string, any> }) => this.rows.find((r) => matches(r, where)) ?? null;
  find = async ({ where }: { where?: Record<string, any> | Record<string, any>[] } = {}) => (!where ? [...this.rows] : this.rows.filter((r) => (Array.isArray(where) ? where.some((w) => matches(r, w)) : matches(r, where))));
  count = async ({ where }: { where: Record<string, any> }) => this.rows.filter((r) => matches(r, where)).length;
  update = async (criteria: string | Record<string, any>, patch: Record<string, any>) => {
    for (const r of this.rows) if (typeof criteria === "string" ? r.id === criteria : matches(r, criteria)) Object.assign(r, patch);
  };
  createQueryBuilder = () => {
    let value: unknown;
    const qb = { addSelect: () => qb, setLock: () => qb, where: (_s: string, p: Record<string, unknown>) => { value = Object.values(p)[0]; return qb; }, getOne: async () => this.rows.find((r) => r[this.key] === value) ?? null };
    return qb;
  };
}

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF");
const validDto = (over: Partial<SubmitReportDto> = {}): SubmitReportDto => ({
  idempotencyKey: randomUUID(), title: "Saudi Digital Health Market Report 2026", reportType: "Market Intelligence", sector: "Digital Health", geography: "Saudi Arabia",
  publicationDate: "2026", description: "A review of the Saudi digital health market and its main segments.", executiveSummary: "x".repeat(80),
  authorName: "Sara Khalid", organizationName: "Example Org", authorEmail: "Sara@Example.com", reportUrl: "https://example.org/report.pdf", declaration: true, ...over,
} as SubmitReportDto);

function world() {
  const subs = new FakeRepo("id", ["userId", "idempotencyKey"]); const files = new FakeRepo("id"); const tokens = new FakeRepo("tokenHash"); const reports = new FakeRepo("id");
  const sent: { review: any[]; published: any[]; rejected: any[] } = { review: [], published: [], rejected: [] };
  const behaviour = { reviewResult: true as boolean | "throw" };
  const email = {
    sendReportSubmissionReview: jest.fn(async (p: any) => { sent.review.push(p); if (behaviour.reviewResult === "throw") throw new Error("boom"); return behaviour.reviewResult === true; }),
    sendReportPublished: jest.fn(async (p: any) => { sent.published.push(p); return true; }),
    sendReportRejected: jest.fn(async (p: any) => { sent.rejected.push(p); return true; }),
  };
  const users = { findByIdOrThrow: jest.fn(async (id: string) => ({ id, email: `${id.slice(0, 4)}@user.test`, firstName: "Sara" })) };
  const reportsService = { uniqueSlug: jest.fn(async (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) };
  const repoFor = new Map<unknown, FakeRepo>([[ReportSubmission, subs], [ReportFile, files], [ReportReviewToken, tokens], [Report, reports]]);
  const db = { transaction: async (fn: (m: any) => Promise<unknown>) => fn({ getRepository: (c: unknown) => repoFor.get(c) }) };
  const svc = new ReportSubmissionsService(subs as never, files as never, tokens as never, reports as never, reportsService as never, users as never, email as never, db as never);
  const lastToken = () => sent.review[sent.review.length - 1].token as string;
  return { svc, subs, files, tokens, reports, sent, email, behaviour, lastToken, users };
}

const USER_A = randomUUID(); const USER_B = randomUUID();

describe("submitting a report", () => {
  it("creates a PENDING_REVIEW request owned by the user and emails the reviewer once", async () => {
    const w = world();
    const r = await w.svc.submit(USER_A, validDto());
    expect(r).toMatchObject({ title: "Saudi Digital Health Market Report 2026", status: "PENDING_REVIEW", reportSlug: null });
    expect(w.subs.rows).toHaveLength(1);
    expect(w.subs.rows[0]).toMatchObject({ userId: USER_A, status: "PENDING_REVIEW", declarationAccepted: true, authorEmail: "sara@example.com", publicationDate: "2026-01-01", reviewEmailAttempts: 1 });
    expect(w.subs.rows[0].reviewEmailSentAt).toBeInstanceOf(Date);
    expect(w.sent.review).toHaveLength(1);
    expect(w.reports.rows).toHaveLength(0); // nothing public yet
  });

  it("stores only the hash of the review token", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const raw = w.lastToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.tokens.rows[0].tokenHash).toBe(hashReviewToken(raw));
    expect(JSON.stringify([...w.tokens.rows, ...w.subs.rows])).not.toContain(raw);
    expect(w.tokens.rows[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86400_000);
  });

  it("does not create duplicates when the same request is sent twice (idempotency)", async () => {
    const w = world();
    const dto = validDto();
    const [a, b] = await Promise.all([w.svc.submit(USER_A, dto), w.svc.submit(USER_A, dto)]);
    const c = await w.svc.submit(USER_A, dto);
    expect(w.subs.rows).toHaveLength(1);
    expect([a.id, b.id, c.id].every((id) => id === w.subs.rows[0].id)).toBe(true);
    expect(w.sent.review.length).toBe(1);
  });

  it("the same key from a different user is a different request", async () => {
    const w = world();
    const dto = validDto();
    await w.svc.submit(USER_A, dto);
    await w.svc.submit(USER_B, dto);
    expect(w.subs.rows).toHaveLength(2);
  });

  it("needs a report link or a PDF", async () => {
    const w = world();
    await expect(w.svc.submit(USER_A, validDto({ reportUrl: undefined }))).rejects.toBeInstanceOf(BadRequestException);
    expect(w.subs.rows).toHaveLength(0);
  });

  it("only accepts an uploaded PDF that belongs to the user and isn't already used", async () => {
    const w = world();
    const { fileId } = await w.svc.saveFile({ buffer: PDF, size: PDF.length, originalname: "r.pdf" } as never, USER_A);
    await expect(w.svc.submit(USER_B, validDto({ reportUrl: undefined, fileId }))).rejects.toBeInstanceOf(BadRequestException);
    await w.svc.submit(USER_A, validDto({ reportUrl: undefined, fileId }));
    await expect(w.svc.submit(USER_A, validDto({ reportUrl: undefined, fileId }))).rejects.toThrow(/already attached/);
  });

  it("keeps the submission PENDING when the email is not accepted, and when the email provider throws", async () => {
    for (const result of [false, "throw"] as const) {
      const w = world();
      w.behaviour.reviewResult = result;
      const r = await w.svc.submit(USER_A, validDto());
      expect(r.status).toBe("PENDING_REVIEW");
      expect(w.subs.rows[0]).toMatchObject({ status: "PENDING_REVIEW", reviewEmailAttempts: 1 });
      expect(w.subs.rows[0].reviewEmailSentAt ?? null).toBeNull();
    }
  });

  it("an admin can resend: the old link stops working and the new one works", async () => {
    const w = world();
    w.behaviour.reviewResult = false;
    const sub = await w.svc.submit(USER_A, validDto());
    const oldToken = w.lastToken();
    w.behaviour.reviewResult = true;
    await expect(w.svc.resendReviewEmail(sub.id)).resolves.toEqual({ sent: true });
    const newToken = w.lastToken();
    expect(newToken).not.toBe(oldToken);
    await expect(w.svc.reviewInfo(oldToken)).rejects.toBeInstanceOf(ConflictException);
    await expect(w.svc.reviewInfo(newToken)).resolves.toMatchObject({ title: sub.title });
    expect(w.subs.rows[0].reviewEmailAttempts).toBe(2);
  });

  it("cannot resend a request that was already reviewed", async () => {
    const w = world();
    const sub = await w.svc.submit(USER_A, validDto());
    await w.svc.decide(w.lastToken(), "REJECT");
    await expect(w.svc.resendReviewEmail(sub.id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("the review link", () => {
  it("opening it (reviewInfo) changes nothing", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const t = w.lastToken();
    for (let i = 0; i < 3; i++) await w.svc.reviewInfo(t);
    expect(w.subs.rows[0].status).toBe("PENDING_REVIEW");
    expect(w.tokens.rows[0].usedAt ?? null).toBeNull();
    expect(w.reports.rows).toHaveLength(0);
  });

  it("shows the reviewer the report but not the author's email", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto({ sources: [{ title: "WHO", url: "https://who.int/x" }] }));
    const info = await w.svc.reviewInfo(w.lastToken());
    expect(info).toMatchObject({ authorName: "Sara Khalid", organizationName: "Example Org", sector: "Digital Health", geography: "Saudi Arabia", sources: [{ title: "WHO", url: "https://who.int/x" }] });
    expect(JSON.stringify(info)).not.toContain("sara@example.com");
  });

  it("rejects unknown, malformed and expired links", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    await expect(w.svc.reviewInfo("nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.svc.reviewInfo("A".repeat(43))).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.svc.reviewInfo(undefined)).rejects.toBeInstanceOf(NotFoundException);
    w.tokens.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(w.svc.reviewInfo(w.lastToken())).rejects.toBeInstanceOf(GoneException);
    await expect(w.svc.decide(w.lastToken(), "ACCEPT")).rejects.toBeInstanceOf(GoneException);
    expect(w.reports.rows).toHaveLength(0);
  });

  it("a link for one report cannot touch another report", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const tokenA = w.lastToken();
    await w.svc.submit(USER_B, validDto({ title: "Another Report About Biotech" }));
    await w.svc.decide(tokenA, "ACCEPT");
    expect(w.subs.rows.find((s) => s.userId === USER_A)!.status).toBe("PUBLISHED");
    expect(w.subs.rows.find((s) => s.userId === USER_B)!.status).toBe("PENDING_REVIEW");
    expect(w.reports.rows).toHaveLength(1);
  });
});

describe("accepting", () => {
  it("publishes the report, records the audit trail and tells the requester", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto({ sources: [{ title: "WHO", url: "https://www.who.int/x" }] }));
    const out = await w.svc.decide(w.lastToken(), "ACCEPT");
    expect(out).toMatchObject({ status: "PUBLISHED", reportSlug: "saudi-digital-health-market-report-2026" });
    expect(w.reports.rows).toHaveLength(1);
    expect(w.reports.rows[0]).toMatchObject({
      isPublished: true, origin: "USER_SUBMITTED", title: "Saudi Digital Health Market Report 2026", sector: "Digital Health", geography: "Saudi Arabia", reportType: "Market Intelligence",
      category: "Market Intelligence", authors: ["Sara Khalid"], organizationName: "Example Org", reportUrl: "https://example.org/report.pdf", provenanceSources: ["who.int"], publicationDate: new Date().toISOString().slice(0, 10), reportDate: "2026-01-01",
    });
    expect(w.reports.rows[0].publishedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(w.reports.rows[0])).not.toContain("sara@example.com"); // the author's email never reaches the public row
    expect(w.subs.rows[0]).toMatchObject({ status: "PUBLISHED", reviewAction: "ACCEPT", reviewedVia: "EMAIL_TOKEN", reviewedByUserId: null, publishedReportId: w.reports.rows[0].id });
    expect(w.subs.rows[0].reviewedAt).toBeInstanceOf(Date);
    expect(w.sent.published).toEqual([expect.objectContaining({ title: "Saudi Digital Health Market Report 2026", slug: "saudi-digital-health-market-report-2026", firstName: "Sara" })]);
    expect(w.sent.rejected).toHaveLength(0);
  });

  it("the link works once: a second Confirm (or a scanner replay) is refused and creates no duplicate", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const t = w.lastToken();
    await w.svc.decide(t, "ACCEPT");
    await expect(w.svc.decide(t, "ACCEPT")).rejects.toBeInstanceOf(ConflictException);
    await expect(w.svc.decide(t, "REJECT")).rejects.toBeInstanceOf(ConflictException);
    await expect(w.svc.reviewInfo(t)).rejects.toBeInstanceOf(ConflictException);
    expect(w.reports.rows).toHaveLength(1);
    expect(w.sent.published).toHaveLength(1);
  });

  it("still publishes when the requester's notification email fails", async () => {
    const w = world();
    w.email.sendReportPublished.mockRejectedValueOnce(new Error("provider down"));
    await w.svc.submit(USER_A, validDto());
    await expect(w.svc.decide(w.lastToken(), "ACCEPT")).resolves.toMatchObject({ status: "PUBLISHED" });
    expect(w.reports.rows).toHaveLength(1);
  });
});

describe("rejecting", () => {
  it("keeps the report private, stores the reason and notifies the requester", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const out = await w.svc.decide(w.lastToken(), "REJECT", "  Not enough sourcing.  ");
    expect(out).toMatchObject({ status: "REJECTED", reportSlug: null });
    expect(w.reports.rows).toHaveLength(0);
    expect(w.subs.rows[0]).toMatchObject({ status: "REJECTED", reviewAction: "REJECT", rejectionReason: "Not enough sourcing.", reviewedVia: "EMAIL_TOKEN" });
    expect(w.subs.rows[0].rejectedAt).toBeInstanceOf(Date);
    expect(w.sent.rejected).toEqual([expect.objectContaining({ reason: "Not enough sourcing.", title: "Saudi Digital Health Market Report 2026" })]);
    expect(w.sent.published).toHaveLength(0);
  });

  it("a rejection without a reason is fine, and the link can't then be used to accept", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    const t = w.lastToken();
    await w.svc.decide(t, "REJECT");
    expect(w.subs.rows[0].rejectionReason).toBeNull();
    await expect(w.svc.decide(t, "ACCEPT")).rejects.toBeInstanceOf(ConflictException);
    expect(w.reports.rows).toHaveLength(0);
  });

  it("shows the requester their rejection reason, only on their own request", async () => {
    const w = world();
    const sub = await w.svc.submit(USER_A, validDto());
    await w.svc.decide(w.lastToken(), "REJECT", "Out of scope");
    await expect(w.svc.getMine(USER_A, sub.id)).resolves.toMatchObject({ status: "REJECTED", rejectionReason: "Out of scope" });
  });
});

describe("ownership", () => {
  it("each user sees only their own submissions", async () => {
    const w = world();
    const a = await w.svc.submit(USER_A, validDto());
    await w.svc.submit(USER_B, validDto({ title: "User B's Own Report On Genomics" }));
    expect((await w.svc.listMine(USER_A)).map((s) => s.id)).toEqual([a.id]);
    await expect(w.svc.getMine(USER_B, a.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.svc.getMine(USER_B, "not-an-id")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists the public slug once published", async () => {
    const w = world();
    await w.svc.submit(USER_A, validDto());
    await w.svc.decide(w.lastToken(), "ACCEPT");
    expect((await w.svc.listMine(USER_A))[0]).toMatchObject({ status: "PUBLISHED", reportSlug: "saudi-digital-health-market-report-2026" });
  });
});

describe("the uploaded PDF", () => {
  const upload = (buffer: Buffer, name = "r.pdf") => ({ buffer, size: buffer.length, originalname: name }) as never;

  it("accepts a real PDF and cleans its file name", async () => {
    const w = world();
    const r = await w.svc.saveFile(upload(PDF, "../../etc/my report<>.pdf"), USER_A);
    expect(r.fileName).toBe("my report__.pdf");
    expect(w.files.rows[0]).toMatchObject({ ownerUserId: USER_A, mimeType: "application/pdf", size: PDF.length });
  });

  it("rejects a non-PDF even when it is named .pdf, and rejects oversized files", async () => {
    const w = world();
    await expect(w.svc.saveFile(upload(Buffer.from("MZ\x90\x00 this is an executable"), "evil.pdf"), USER_A)).rejects.toThrow(/must be a PDF/);
    await expect(w.svc.saveFile(upload(Buffer.from("<html><script>alert(1)</script></html>"), "x.pdf"), USER_A)).rejects.toThrow(/must be a PDF/);
    await expect(w.svc.saveFile({ buffer: PDF, size: 11 * 1024 * 1024, originalname: "big.pdf" } as never, USER_A)).rejects.toThrow(/10 MB/);
    await expect(w.svc.saveFile(undefined, USER_A)).rejects.toBeInstanceOf(BadRequestException);
    expect(w.files.rows).toHaveLength(0);
  });

  it("a pending PDF is not public; the owner and the review link can read it; publishing makes it public", async () => {
    const w = world();
    const { fileId } = await w.svc.saveFile(upload(PDF), USER_A);
    const sub = await w.svc.submit(USER_A, validDto({ reportUrl: undefined, fileId }));
    await expect(w.svc.publishedFile(fileId)).rejects.toBeInstanceOf(NotFoundException); // pending: private
    await expect(w.svc.ownerFile(USER_B, sub.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(w.svc.ownerFile(USER_A, sub.id)).resolves.toMatchObject({ mimeType: "application/pdf" });
    await expect(w.svc.reviewFile(w.lastToken())).resolves.toMatchObject({ fileName: "r.pdf" });
    await w.svc.decide(w.lastToken(), "ACCEPT");
    await expect(w.svc.publishedFile(fileId)).resolves.toMatchObject({ mimeType: "application/pdf" });
    w.reports.rows[0].isPublished = false; // an admin unpublishes the report
    await expect(w.svc.publishedFile(fileId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("a rejected report's PDF never becomes public", async () => {
    const w = world();
    const { fileId } = await w.svc.saveFile(upload(PDF), USER_A);
    await w.svc.submit(USER_A, validDto({ reportUrl: undefined, fileId }));
    await w.svc.decide(w.lastToken(), "REJECT");
    await expect(w.svc.publishedFile(fileId)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("helpers", () => {
  it("recognises PDFs by content", () => {
    expect(looksLikePdf(PDF)).toBe(true);
    expect(looksLikePdf(Buffer.concat([Buffer.from("\n\n"), PDF]))).toBe(true);
    expect(looksLikePdf(Buffer.from("plain text file that is long enough"))).toBe(false);
    expect(looksLikePdf(Buffer.from("%PDF"))).toBe(false);
  });
  it("normalizes publication dates", () => {
    expect(normalizePublicationDate("2026")).toBe("2026-01-01");
    expect(normalizePublicationDate("2026-03-15")).toBe("2026-03-15");
    expect(normalizePublicationDate("2026-02-31")).toBeNull();
    expect(normalizePublicationDate(undefined)).toBeNull();
  });
  it("files reports under an existing directory chip", () => {
    expect(chooseCategory("Regulatory", "Digital Health")).toBe("Regulatory");
    expect(chooseCategory("Research Report", "Biotechnology")).toBe("Biotechnology");
    expect(chooseCategory("Other", "Other")).toBe("Market Intelligence");
  });
  it("safeFileName always ends in .pdf and has no path", () => {
    expect(safeFileName("a/b/c.PDF")).toBe("c.PDF");
    expect(safeFileName("weird")).toBe("weird.pdf");
    expect(safeFileName(undefined)).toBe("report.pdf");
  });
});
