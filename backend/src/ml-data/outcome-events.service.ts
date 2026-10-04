import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { StartupOutcomeEvent } from "./outcome-event.entity";
import { OutcomeEventSource, StartupOutcomeEventType } from "../common/enums";

export interface OutcomeEventInput {
  eventType: StartupOutcomeEventType;
  eventDate: string;
  valueNumeric?: number;
  valueText?: string;
  source: OutcomeEventSource;
  verified?: boolean;
  sourceDocumentId?: string;
  sourceUrl?: string;
  notes?: string;
}

/** Append-only writes to startup_outcome_events — the raw evidence future
 * ML labels are computed from (see ml-data/labels/). Never deleted, and
 * only valueText can be corrected (see correctValueText) — mirroring every
 * other audit-trail table in this codebase (submission_review_events,
 * startup_score_history). */
@Injectable()
export class OutcomeEventsService {
  constructor(@InjectRepository(StartupOutcomeEvent) private readonly repo: Repository<StartupOutcomeEvent>) {}

  listForStartup(startupId: string): Promise<StartupOutcomeEvent[]> {
    return this.repo.find({ where: { startupId }, order: { eventDate: "DESC" } });
  }

  listAll(): Promise<StartupOutcomeEvent[]> {
    return this.repo.find();
  }

  /** Admin-entered event — an admin correcting or backfilling history is
   * trusted to know what they're adding, so no dedup guard here (they may
   * legitimately want two distinct events on the same date, e.g. two
   * tranches of the same round). */
  async createAdminEvent(startupId: string, input: OutcomeEventInput, adminUserId: string): Promise<StartupOutcomeEvent> {
    return this.repo.save(this.repo.create({ startupId, ...input, createdByUserId: adminUserId }));
  }

  /** The one sanctioned in-place edit: fix an event's valueText when it does
   * not use the exact vocabulary the label engine matches against. Nothing
   * else on the event can change, a reason is required, and the previous
   * value + reason + actor + date are appended to `notes` so the correction
   * is always traceable. */
  async correctValueText(startupId: string, eventId: string, valueText: string, reason: string, adminUserId: string): Promise<StartupOutcomeEvent> {
    const [event] = await this.repo.find({ where: { id: eventId, startupId } });
    if (!event) throw new NotFoundException(`Outcome event ${eventId} not found for startup ${startupId}`);
    const previous = event.valueText ?? "(empty)";
    if (previous === valueText) return event;
    const audit = `[valueText corrected ${new Date().toISOString().slice(0, 10)} by admin ${adminUserId}: "${previous}" -> "${valueText}". Reason: ${reason}]`;
    event.valueText = valueText;
    event.notes = event.notes ? `${event.notes} ${audit}` : audit;
    return this.repo.save(event);
  }

  /** System-derived event (from an automatic hook — see
   * StartupSubmissionPublisher and ScoringService.writeFeatures) —
   * idempotent: skipped if an event with the same startupId + eventType +
   * eventDate + valueNumeric + valueText already exists, so re-running the
   * same underlying write (e.g. re-publishing) never creates a duplicate. */
  async createSystemEventIfNew(startupId: string, input: Omit<OutcomeEventInput, "source" | "verified">): Promise<StartupOutcomeEvent | null> {
    const existing = await this.repo.find({ where: { startupId, eventType: input.eventType, eventDate: input.eventDate } });
    const duplicate = existing.some((e) => (e.valueNumeric ?? null) === (input.valueNumeric ?? null) && (e.valueText ?? null) === (input.valueText ?? null));
    if (duplicate) return null;
    return this.repo.save(this.repo.create({ startupId, ...input, source: OutcomeEventSource.SYSTEM_DERIVED, verified: false }));
  }
}
