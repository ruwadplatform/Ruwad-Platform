import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { EntityKind } from "../common/enums";
import {
  startupSubmissionReceivedTemplate,
  dataRoomRequestedTemplate,
  dataRoomReviewedTemplate,
  introductionStatusChangedTemplate,
} from "./email-templates";

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

  constructor(config: ConfigService) {
    const apiKey = config.get<string>("RESEND_API_KEY");
    this.client = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>("EMAIL_FROM") ?? "RUWĀD <onboarding@resend.dev>";
    this.appUrl = (config.get<string>("APP_URL") ?? "http://localhost:5174").replace(/\/+$/, "");
    this.adminEmail = config.get<string>("ADMIN_NOTIFICATION_EMAIL") ?? "";
    if (!apiKey) this.logger.warn("RESEND_API_KEY not set — email notifications are disabled (attempts will be logged only).");
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!to) {
      this.logger.warn(`Email skipped (no recipient resolved): "${subject}"`);
      return;
    }
    if (!this.client) {
      this.logger.warn(`Email skipped (Resend not configured): "${subject}" -> ${to}`);
      return;
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
      }
    } catch (e) {
      this.logger.error(`Failed to send email "${subject}" to ${to}: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  /** Startup submission received — always sent to ADMIN_NOTIFICATION_EMAIL,
   * regardless of the submitter's own notification preferences (this is an
   * administrative workflow notification, not a personal one). */
  async sendStartupSubmissionReceived(p: {
    startupName: string; submitterName: string; submitterEmail: string;
    category: string; stage: string; submissionId: string; submittedAt: Date;
  }): Promise<void> {
    if (!this.adminEmail) {
      this.logger.warn("ADMIN_NOTIFICATION_EMAIL not set — skipping startup submission notification email.");
      return;
    }
    const html = startupSubmissionReceivedTemplate({
      startupName: p.startupName,
      submitterName: p.submitterName,
      submitterEmail: p.submitterEmail,
      category: p.category,
      stage: p.stage,
      submissionId: p.submissionId,
      submittedAt: formatDate(p.submittedAt),
      reviewUrl: `${this.appUrl}/admin/submissions/${p.submissionId}`,
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
}
