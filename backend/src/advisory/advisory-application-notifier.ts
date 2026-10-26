import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailService } from "../email/email.service";
import { detailsTable, escapeHtml, layout } from "../email/email-templates";
import { User } from "../users/user.entity";
import { AdvisoryAdvisor, AdvisoryApplicationEvent } from "./advisory.entities";
import { EmailMode, emailModeFrom } from "./advisory-notifier";
import { formatRiyadh } from "./advisory-time";

/** Where a new application is announced unless ADVISORY_APPLICATIONS_EMAIL says otherwise. */
export const DEFAULT_APPLICATIONS_INBOX = "ruwadplatform@gmail.com";

export type ApplicationEmailKind = "ADMIN_NEW_APPLICATION" | "APPLICANT_APPROVED" | "APPLICANT_REJECTED";
export interface ComposedEmail { subject: string; html: string }

export interface NewApplicationFacts {
  id: string; name: string; email: string; phone: string; institution: string; designation: string; specialization: string;
  yearsExperience: number | null; submittedAt: Date; reference: string;
}

/** The message to RUWĀD when someone applies. It carries the facts an administrator needs to decide whether to look now, and a link to the
 * Admin Dashboard. It never contains a document or a link to one: the CV and certificates stay behind the administrator's sign-in. */
export function composeNewApplicationEmail(a: NewApplicationFacts, appUrl: string): ComposedEmail {
  const rows: [string, string][] = [
    ["Applicant", a.name],
    ["Email", a.email],
    ["Phone", a.phone],
    ["Institution", a.institution],
    ["Professional designation", a.designation],
    ["Specialization", a.specialization],
    ["Years of experience", a.yearsExperience === null ? "Not stated" : String(a.yearsExperience)],
    ["Submitted", formatRiyadh(a.submittedAt)],
    ["Application reference", a.reference],
  ];
  const link = `${appUrl}/admin/advisory?application=${encodeURIComponent(a.id)}`;
  return {
    subject: "New Advisor Application – RUWĀD Advisory Services",
    html: layout(
      "New advisor application",
      `<p style="margin:0;">A new application to join RUWĀD Advisory Services is waiting for review.</p>${detailsTable(rows)}<p style="margin:16px 0 0;">Please log in to RUWĀD to review the application and its supporting documents. Documents are not attached to this email and are only available to signed-in administrators.</p>`,
      { text: "Review in Admin Dashboard", url: link },
    ),
  };
}

const paragraphs = (...ps: string[]) => ps.map((p, i) => `<p style="margin:${i === 0 ? "0" : "14px"} 0 0;">${p}</p>`).join("");
const sign = `Best regards,<br/>RUWĀD Team`;

export function composeApprovalEmail(name: string, appUrl: string): ComposedEmail {
  return {
    subject: "Your RUWĀD Advisor Application Has Been Approved",
    html: layout(
      "Your application has been approved",
      paragraphs(
        `Dear ${escapeHtml(name)},`,
        "We are pleased to inform you that your application to join RUWĀD Advisory Services has been approved.",
        "You can now access your Advisor Dashboard, complete your professional profile, manage your consultation services, and configure your availability.",
        "We look forward to welcoming you to the RUWĀD advisory network.",
        sign,
      ),
      { text: "Open Advisor Dashboard", url: `${appUrl}/workspace/advisor` },
    ),
  };
}

/** The reason is the administrator's own text: escaped, line breaks kept, and shown only to this applicant. */
export function composeRejectionEmail(name: string, reason: string): ComposedEmail {
  const safeReason = escapeHtml(reason.trim()).replace(/\r?\n/g, "<br/>");
  return {
    subject: "Update on Your RUWĀD Advisor Application",
    html: layout(
      "An update on your application",
      paragraphs(
        `Dear ${escapeHtml(name)},`,
        "Thank you for your interest in joining RUWĀD Advisory Services.",
        "After reviewing your application, we regret to inform you that your application has not been approved at this time.",
        `<strong>Reason:</strong> ${safeReason}`,
        "We appreciate your interest in RUWĀD and encourage you to contact our team if you have any questions.",
        sign,
      ),
    ),
  };
}

/** Emails about advisor applications. MOCK BY DEFAULT, on the same switch as the booking emails: nothing is sent unless ADVISORY_EMAIL_MODE is
 * exactly "live" (and Resend itself is configured). Every attempt, sent or not, is written to the application's history naming only who it was for
 * and the subject, never an address. Nothing here can throw: a failed email must never undo or hide a submission or a decision. */
@Injectable()
export class AdvisoryApplicationNotifier {
  private readonly logger = new Logger(AdvisoryApplicationNotifier.name);
  readonly mode: EmailMode;
  readonly inbox: string;
  private readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly email: EmailService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdvisoryApplicationEvent) private readonly events: Repository<AdvisoryApplicationEvent>,
  ) {
    this.mode = emailModeFrom(config.get<string>("ADVISORY_EMAIL_MODE"));
    this.inbox = (config.get<string>("ADVISORY_APPLICATIONS_EMAIL") ?? "").trim() || DEFAULT_APPLICATIONS_INBOX;
    this.appUrl = (config.get<string>("APP_URL") ?? "http://localhost:5174").replace(/\/+$/, "");
  }

  /** Tells RUWĀD a new application arrived. */
  async newApplication(advisor: AdvisoryAdvisor): Promise<void> {
    const composed = composeNewApplicationEmail({
      id: advisor.id, name: advisor.name, email: advisor.contactEmail ?? "", phone: advisor.phone ?? "", institution: advisor.institution, designation: advisor.designation,
      specialization: advisor.specialization, yearsExperience: advisor.yearsExperience, submittedAt: advisor.submittedAt ?? advisor.createdAt, reference: advisor.applicationReference ?? "",
    }, this.appUrl);
    await this.deliver(advisor, "ADMIN_NEW_APPLICATION", "ADMIN", () => this.inbox, composed);
  }

  async approved(advisor: AdvisoryAdvisor): Promise<void> {
    await this.deliver(advisor, "APPLICANT_APPROVED", "APPLICANT", () => this.applicantAddress(advisor), composeApprovalEmail(advisor.name, this.appUrl));
  }

  async rejected(advisor: AdvisoryAdvisor, reason: string): Promise<void> {
    await this.deliver(advisor, "APPLICANT_REJECTED", "APPLICANT", () => this.applicantAddress(advisor), composeRejectionEmail(advisor.name, reason));
  }

  /** The address typed on the form, or the account's address for a profile created before the form existed. */
  private async applicantAddress(advisor: AdvisoryAdvisor): Promise<string | null> {
    if (advisor.contactEmail) return advisor.contactEmail;
    const user = advisor.userId ? await this.users.findOne({ where: { id: advisor.userId }, select: { id: true, email: true } }) : null;
    return user?.email ?? null;
  }

  private async deliver(advisor: AdvisoryAdvisor, kind: ApplicationEmailKind, recipient: "ADMIN" | "APPLICANT", address: () => string | null | Promise<string | null>, composed: ComposedEmail): Promise<void> {
    try {
      let result: "mock" | "sent" | "failed" | "skipped" = "mock";
      let skipped: string | undefined;
      if (advisor.isDemo) {
        result = "skipped";
        skipped = "demonstration profile: demonstration profiles are never emailed";
      } else if (this.mode === "mock") {
        this.logger.log(`[mock email] ${kind} -> ${recipient} (${advisor.applicationReference ?? advisor.id}): "${composed.subject}"`);
      } else {
        const to = await address();
        result = to && (await this.email.sendTransactional(to, composed.subject, composed.html)) ? "sent" : "failed";
      }
      await this.events.save(this.events.create({
        advisorId: advisor.id, actorUserId: null, actorRole: "SYSTEM", type: "NOTIFICATION", fromStatus: null, toStatus: null, note: null,
        details: { kind, mode: this.mode, recipient, subject: composed.subject, result, ...(skipped ? { skipped } : {}) },
      }));
    } catch (e) {
      this.logger.error(`Application email failed (${kind}, ${advisor.applicationReference ?? advisor.id}): ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }
}
