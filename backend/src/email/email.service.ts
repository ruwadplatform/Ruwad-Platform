import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { EntityKind } from "../common/enums";
import {
  startupSubmissionReceivedTemplate,
  dataRoomRequestedTemplate,
  dataRoomReviewedTemplate,
  introductionStatusChangedTemplate,
  passwordResetTemplate,
  reportSubmissionReviewTemplate,
  reportPublishedTemplate,
  reportRejectedTemplate,
} from "./email-templates";
import { signEmailAction } from "./email-action-token";

const ENTITY_PATH: Record<EntityKind, string> = {
  [EntityKind.STARTUP]: "startups",
  [EntityKind.INVESTOR]: "investors",
  [EntityKind.HUB]: "hubs",
  [EntityKind.RESEARCH]: "research",
  [EntityKind.MULTINATIONAL]: "multinationals",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Thin wrapper around Resend — same "degrade gracefully, never throw"
 * pattern as resume-parse.service.ts/submission-autofill.service.ts for a
 * missing API key. The one hard rule for every method here: a failed or
 * skipped send is logged and swallowed, never propagated, so email is
 * never able to fail the business action that triggered it. Nothing here
 * ever logs the API key or the provider's raw response body. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly adminEmail: string;
  private readonly apiUrl: string;
  private readonly actionSecret: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("RESEND_API_KEY");
    this.client = apiKey ? new Resend(apiKey) : null;
    // No fallback sender on purpose: every email must come from the verified
    // address configured in EMAIL_FROM. Without it, sends are skipped (see send()).
    this.from = (config.get<string>("EMAIL_FROM") ?? "").trim();
    this.appUrl = (config.get<string>("APP_URL") ?? "http://localhost:5174").replace(/\/+$/, "");
    this.adminEmail = config.get<string>("ADMIN_NOTIFICATION_EMAIL") ?? "";
    // Render injects RENDER_EXTERNAL_URL for every web service; PUBLIC_API_URL overrides it.
    this.apiUrl = (config.get<string>("PUBLIC_API_URL") ?? config.get<string>("RENDER_EXTERNAL_URL") ?? "http://localhost:4000").replace(/\/+$/, "").replace(/\/api$/, "");
    this.actionSecret = config.get<string>("JWT_SECRET") ?? "";
    if (!apiKey) this.logger.warn("RESEND_API_KEY not set — email notifications are disabled (attempts will be logged only).");
    if (!this.from) this.logger.warn("EMAIL_FROM not set — email notifications are disabled until a verified sender is configured.");
  }

  /** Resolves true only when the provider accepted the message; every failure path logs and returns false. */
  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!to) {
      this.logger.warn(`Email skipped (no recipient resolved): "${subject}"`);
      return false;
    }
    if (!this.client || !this.from) {
      this.logger.warn(`Email skipped (${!this.client ? "Resend not configured" : "EMAIL_FROM not set"}): "${subject}" -> ${to}`);
      return false;
    }
    try {
      // The SDK resolves with { data, error } for API-level failures (bad
      // key, invalid sender, etc.) rather than throwing — only a network-
      // level failure (timeout, connection refused) throws. Both paths are
      // handled here so neither can slip past silently. Never logs the API
      // key; `error.message` from Resend is a safe, generic description
      // (e.g. "API key is invalid"), never the key itself.
      const { error } = await this.client.emails.send({ from: this.from, to, subject, html });
      if (error) {
        this.logger.error(`Failed to send email "${subject}" to ${to}: ${error.name} — ${error.message}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.error(`Failed to send email "${subject}" to ${to}: ${e instanceof Error ? e.message : "unknown error"}`);
      return false;
    }
  }

  /** Startup submission received — always sent to ADMIN_NOTIFICATION_EMAIL,
   * regardless of the submitter's own notification preferences (this is an
   * administrative workflow notification, not a personal one). */
  async sendStartupSubmissionReceived(p: {
    startupName: string; submitterName: string; submitterEmail: string;
    submissionId: string; submittedAt: Date; payload: Record<string, unknown>;
  }): Promise<void> {
    if (!this.adminEmail) {
      this.logger.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping startup submission notification email.");
      return;
    }
    const actionUrl = (act: "approve" | "reject") =>
      `${this.apiUrl}/api/email-actions/submission?token=${signEmailAction(p.submissionId, act, this.actionSecret)}`;
    const html = startupSubmissionReceivedTemplate({
      startupName: p.startupName,
      submitterName: p.submitterName,
      submitterEmail: p.submitterEmail,
      submissionId: p.submissionId,
      submittedAt: formatDate(p.submittedAt),
      payload: p.payload,
      approveUrl: actionUrl("approve"),
      rejectUrl: actionUrl("reject"),
    });
    await this.send(this.adminEmail, `New Startup Submission: ${p.startupName}`, html);
  }

  async sendDataRoomRequested(p: {
    to: string; requesterName: string; requesterEmail: string; profileName: string; requestedAt: Date;
  }): Promise<void> {
    const html = dataRoomRequestedTemplate({
      requesterName: p.requesterName,
      requesterEmail: p.requesterEmail,
      profileName: p.profileName,
      requestType: "Data Room Access",
      requestedAt: formatDate(p.requestedAt),
      // The owner review page — an authenticated route; the owner must
      // sign in to RUWĀD to see or act on the request. No token in the link.
      reviewUrl: `${this.appUrl}/my-ndas`,
    });
    await this.send(p.to, `New Data Room Access Request: ${p.profileName}`, html);
  }

  async sendDataRoomReviewed(p: {
    to: string; profileName: string; approved: boolean; kind: EntityKind; entityId: string; reviewedAt: Date;
  }): Promise<void> {
    const html = dataRoomReviewedTemplate({
      profileName: p.profileName,
      approved: p.approved,
      reviewedAt: formatDate(p.reviewedAt),
      profileUrl: `${this.appUrl}/${ENTITY_PATH[p.kind]}/${p.entityId}`,
    });
    await this.send(p.to, `Data Room Access ${p.approved ? "Approved" : "Declined"}: ${p.profileName}`, html);
  }

  async sendIntroductionStatusChanged(p: {
    to: string; targetName: string; statusLabel: string; message?: string;
  }): Promise<void> {
    const html = introductionStatusChangedTemplate({
      targetName: p.targetName,
      statusLabel: p.statusLabel,
      message: p.message,
      introUrl: `${this.appUrl}/introductions`,
    });
    await this.send(p.to, `Introduction Request ${p.statusLabel}: ${p.targetName}`, html);
  }


  /** Publication request for a user-submitted report → ADMIN_NOTIFICATION_EMAIL, with Accept/Reject buttons that open the
   * review page (nothing changes until the reviewer confirms there). Resolves true only if the provider accepted it, so the
   * caller can keep the submission pending and offer a resend when it didn't. The raw token only ever appears in the links. */
  async sendReportSubmissionReview(p: {
    token: string; title: string; reportType: string; sector: string; geography: string; authorName: string; organizationName: string;
    authorEmail: string; submittedAt: Date; executiveSummary: string; reportUrl?: string | null; hasFile: boolean; sources: { title: string; url: string }[];
  }): Promise<boolean> {
    if (!this.adminEmail) {
      this.logger.warn("ADMIN_NOTIFICATION_EMAIL not set — report publication request email not sent.");
      return false;
    }
    const base = `${this.appUrl}/report-review/${encodeURIComponent(p.token)}`;
    const html = reportSubmissionReviewTemplate({
      title: p.title, reportType: p.reportType, sector: p.sector, geography: p.geography, authorName: p.authorName, organizationName: p.organizationName,
      authorEmail: p.authorEmail, submittedAt: formatDate(p.submittedAt), executiveSummary: p.executiveSummary, reportUrl: p.reportUrl, hasFile: p.hasFile, sources: p.sources,
      reviewUrl: base, acceptUrl: `${base}?action=accept`, rejectUrl: `${base}?action=reject`,
    });
    return this.send(this.adminEmail, `New RUWĀD Report Publication Request — ${p.title.replace(/[\r\n]+/g, " ")}`, html);
  }

  async sendReportPublished(p: { to: string; firstName: string; title: string; slug: string }): Promise<boolean> {
    return this.send(p.to, "Your RUWĀD Report Has Been Published", reportPublishedTemplate({ firstName: p.firstName, title: p.title, reportUrl: `${this.appUrl}/reports/${p.slug}` }));
  }

  async sendReportRejected(p: { to: string; firstName: string; title: string; reason?: string | null }): Promise<boolean> {
    return this.send(p.to, "Update on Your RUWĀD Report Submission", reportRejectedTemplate({ firstName: p.firstName, title: p.title, reason: p.reason }));
  }

  /** Security email: never gated by the user's notification preferences.
   * The raw token only ever appears in the link and is not logged. */
  async sendPasswordReset(p: { to: string; firstName: string; token: string }): Promise<void> {
    const html = passwordResetTemplate({
      firstName: p.firstName,
      resetUrl: `${this.appUrl}/reset-password?token=${encodeURIComponent(p.token)}`,
    });
    await this.send(p.to, "Reset your RUWĀD password", html);
  }
}
