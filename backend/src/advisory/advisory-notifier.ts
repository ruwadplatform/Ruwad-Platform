import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailService } from "../email/email.service";
import { detailsTable, escapeHtml, layout } from "../email/email-templates";
import { User } from "../users/user.entity";
import { AdvisoryAdvisor, AdvisoryBooking, AdvisoryBookingEvent } from "./advisory.entities";
import { BookingActorRole, BookingParty } from "./advisory.enums";
import { formatRiyadh } from "./advisory-time";

export type AdvisoryNotificationKind =
  | "REQUESTED" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "RESCHEDULE_PROPOSED" | "RESCHEDULE_ACCEPTED" | "RESCHEDULE_DECLINED"
  // phase 4 (scheduler)
  | "EXPIRED" | "EXPIRY_WARNING" | "REMINDER_24H" | "REMINDER_1H" | "RESCHEDULE_EXPIRED" | "NEEDS_REVIEW";
export type EmailMode = "mock" | "live";

/** Who gets an email for each event. `actor` is the side that caused it, who is never told about their own action. */
export function recipientsFor(kind: AdvisoryNotificationKind, actor: BookingActorRole, proposedBy?: BookingParty | null): BookingParty[] {
  const other = (p: BookingActorRole): BookingParty[] => (p === "FOUNDER" ? ["ADVISOR"] : p === "ADVISOR" ? ["FOUNDER"] : ["FOUNDER", "ADVISOR"]);
  switch (kind) {
    case "REQUESTED": return ["ADVISOR", "FOUNDER"];
    case "CONFIRMED": return ["FOUNDER"];
    case "REJECTED": return ["FOUNDER"];
    case "CANCELLED": return other(actor);
    case "RESCHEDULE_PROPOSED": return proposedBy ? other(proposedBy) : [];
    case "RESCHEDULE_ACCEPTED": return ["FOUNDER", "ADVISOR"];
    case "RESCHEDULE_DECLINED": return proposedBy ? [proposedBy] : [];
    case "EXPIRED": return ["FOUNDER", "ADVISOR"];
    case "EXPIRY_WARNING": return ["ADVISOR"];
    case "REMINDER_24H": return ["FOUNDER", "ADVISOR"];
    case "REMINDER_1H": return ["FOUNDER", "ADVISOR"];
    case "RESCHEDULE_EXPIRED": return ["FOUNDER", "ADVISOR"];
    case "NEEDS_REVIEW": return ["ADVISOR"];
  }
}

/** Reads ADVISORY_EMAIL_MODE; anything but exactly "live" is mock, so a typo can never switch real email on. */
export function emailModeFrom(value: string | undefined): EmailMode {
  return value?.trim().toLowerCase() === "live" ? "live" : "mock";
}

/** Booking notifications. MOCK BY DEFAULT: nothing is emailed unless ADVISORY_EMAIL_MODE is exactly "live" (and Resend itself is configured).
 * Demonstration bookings are never emailed, in any mode. Every attempt, sent or not, is written to the booking's audit trail as a NOTIFICATION
 * event naming only the roles addressed — no email addresses are logged or stored. Nothing here can fail the booking action that triggered it. */
@Injectable()
export class AdvisoryNotifier {
  private readonly logger = new Logger(AdvisoryNotifier.name);
  readonly mode: EmailMode;
  private readonly appUrl: string;

  constructor(
    config: ConfigService,
    private readonly email: EmailService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdvisoryAdvisor) private readonly advisors: Repository<AdvisoryAdvisor>,
    @InjectRepository(AdvisoryBookingEvent) private readonly events: Repository<AdvisoryBookingEvent>,
  ) {
    this.mode = emailModeFrom(config.get<string>("ADVISORY_EMAIL_MODE"));
    this.appUrl = (config.get<string>("APP_URL") ?? "http://localhost:5174").replace(/\/+$/, "");
    this.logger.log(`Advisory email notifications: ${this.mode.toUpperCase()}${this.mode === "mock" ? " (nothing is sent)" : ""}`);
  }

  async notify(booking: AdvisoryBooking, kind: AdvisoryNotificationKind, actor: BookingActorRole, extra: { note?: string | null; proposedBy?: BookingParty | null; previous?: AdvisoryBooking } = {}): Promise<void> {
    try {
      const roles = recipientsFor(kind, actor, extra.proposedBy ?? booking.proposedBy);
      if (!roles.length) return;
      if (booking.isDemo) {
        await this.record(booking, kind, roles, { skipped: "demonstration booking: demonstration bookings are never emailed" });
        return;
      }
      const advisor = await this.advisors.findOne({ where: { id: booking.advisorId } });
      const results: Record<string, boolean | null> = {};
      for (const role of roles) {
        const userId = role === "FOUNDER" ? booking.requestedByUserId : advisor?.userId;
        const user = userId ? await this.users.findOne({ where: { id: userId } }) : null;
        const { subject, html } = this.compose(kind, role, booking, advisor, extra);
        if (this.mode === "mock") {
          this.logger.log(`[mock email] ${kind} -> ${role} (${booking.reference}): "${subject}"`);
          results[role] = null;
        } else if (!user?.email) {
          results[role] = false;
        } else {
          results[role] = await this.email.sendTransactional(user.email, subject, html);
        }
      }
      await this.record(booking, kind, roles, { results });
    } catch (e) {
      this.logger.error(`Booking notification failed (${kind}, ${booking.reference}): ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }

  private async record(booking: AdvisoryBooking, kind: AdvisoryNotificationKind, roles: BookingParty[], details: Record<string, unknown>) {
    await this.events.save(this.events.create({ bookingId: booking.id, actorUserId: null, actorRole: "SYSTEM", type: "NOTIFICATION", fromStatus: null, toStatus: null, details: { kind, mode: this.mode, recipients: roles, ...details } }));
  }

  compose(kind: AdvisoryNotificationKind, role: BookingParty, b: AdvisoryBooking, advisor: AdvisoryAdvisor | null, extra: { note?: string | null; previous?: AdvisoryBooking }) {
    const who = role === "FOUNDER" ? `${advisor?.name ?? "your advisor"}` : b.startupName;
    const when = formatRiyadh(b.startsAt);
    const rows: [string, string][] = [
      ["Reference", b.reference],
      ["Consultation", b.serviceName],
      ["With", role === "FOUNDER" ? (advisor?.name ?? "Advisor") : `${b.startupName}`],
      ["When", when],
      ["Duration", `${b.minutes} minutes`],
      ["Format", "Online via RUWĀD"],
    ];
    if (extra.previous) rows.splice(4, 0, ["Previously", formatRiyadh(extra.previous.startsAt)]);
    if (extra.note) rows.push(["Note", extra.note]);
    const copy: Record<AdvisoryNotificationKind, { subject: string; heading: string; body: string }> = {
      REQUESTED: role === "ADVISOR"
        ? { subject: `New consultation request: ${b.serviceName}`, heading: "New consultation request", body: `${escapeHtml(b.startupName)} has asked for a consultation. Please approve or decline it from your advisor dashboard.` }
        : { subject: `We've received your consultation request`, heading: "Request received", body: `Your request to ${escapeHtml(who)} is waiting for their approval. The time is held for you until they answer.` },
      CONFIRMED: { subject: `Consultation confirmed: ${b.serviceName}`, heading: "Your consultation is confirmed", body: `${escapeHtml(who)} approved your request.` },
      REJECTED: { subject: `Consultation request declined: ${b.serviceName}`, heading: "Your request was declined", body: `${escapeHtml(who)} couldn't accept this request. The time has been released; you can choose another time.` },
      CANCELLED: { subject: `Consultation cancelled: ${b.serviceName}`, heading: "A consultation was cancelled", body: `This consultation was cancelled${b.cancelReason ? `: ${escapeHtml(b.cancelReason)}` : "."}` },
      RESCHEDULE_PROPOSED: { subject: `New time proposed: ${b.serviceName}`, heading: "A new time was proposed", body: "A new time was proposed for your consultation. Your original time stays booked until you accept the new one." },
      RESCHEDULE_ACCEPTED: { subject: `Consultation rescheduled: ${b.serviceName}`, heading: "Your consultation was rescheduled", body: "Both sides agreed a new time." },
      RESCHEDULE_DECLINED: { subject: `New time declined: ${b.serviceName}`, heading: "The proposed time was declined", body: "The other side didn't accept the proposed time. Your original consultation is unchanged." },
      EXPIRED: role === "ADVISOR"
        ? { subject: `Request expired: ${b.serviceName}`, heading: "A request expired unanswered", body: `The request from ${escapeHtml(b.startupName)} wasn't answered in time, so it expired and the time was released.` }
        : { subject: `Request expired: ${b.serviceName}`, heading: "Your request expired", body: `${escapeHtml(who)} didn't answer in time, so the request expired and the time was released. You can choose another time or another advisor.` },
      EXPIRY_WARNING: { subject: `Please answer: ${b.serviceName} request expires soon`, heading: "A request is about to expire", body: `The request from ${escapeHtml(b.startupName)} will expire if it isn't approved or declined. Please answer it from your advisor dashboard.` },
      REMINDER_24H: { subject: `Reminder: ${b.serviceName} tomorrow`, heading: "Your consultation is in about 24 hours", body: "A reminder of your upcoming online consultation." },
      REMINDER_1H: { subject: `Starting soon: ${b.serviceName}`, heading: "Your consultation starts in about an hour", body: "You'll be able to join from RUWĀD shortly before the start time." },
      RESCHEDULE_EXPIRED: { subject: `New time expired: ${b.serviceName}`, heading: "The proposed new time expired", body: "Nobody answered the proposed new time, so it was withdrawn. The original consultation time is unchanged." },
      NEEDS_REVIEW: { subject: `Please confirm what happened: ${b.serviceName}`, heading: "Please record the outcome", body: `The consultation with ${escapeHtml(b.startupName)} has ended. Please confirm whether it took place, from your advisor dashboard.` },
    };
    const c = copy[kind];
    const path = role === "FOUNDER" ? `/workspace/consultations/${b.id}` : "/workspace/advisor";
    return { subject: c.subject, html: layout(c.heading, `${c.body}${detailsTable(rows)}`, { text: role === "FOUNDER" ? "View consultation" : "Open advisor dashboard", url: `${this.appUrl}${path}` }) };
  }
}
