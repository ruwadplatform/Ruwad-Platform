import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Submission } from "./submission.entity";
import { SubmissionReviewEvent } from "./submission-review-event.entity";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { UpdateSubmissionDto, RequestChangesDto, RejectDto, FindSubmissionsQueryDto } from "./dto/update-submission.dto";
import { EntityKind, SubmissionStatus, SubmissionEventType, MembershipRole, ActivityType } from "../common/enums";
import { EntityMembership } from "../organizations/entity-membership.entity";
import { ActivityService } from "../activity/activity.service";
import { SubmissionPublisher } from "./publishers/publisher.types";
import { StartupSubmissionPublisher } from "./publishers/startup-submission.publisher";
import { InvestorSubmissionPublisher } from "./publishers/investor-submission.publisher";
import { HubSubmissionPublisher } from "./publishers/hub-submission.publisher";
import { ResearchSubmissionPublisher } from "./publishers/research-submission.publisher";
import { MultinationalSubmissionPublisher } from "./publishers/multinational-submission.publisher";
import { CreateStartupDto } from "../startups/dto/create-startup.dto";
import { CreateInvestorDto } from "../investors/dto/create-investor.dto";
import { CreateHubDto } from "../hubs/dto/create-hub.dto";
import { CreateResearchDto } from "../research/dto/create-research.dto";
import { CreateMultinationalDto } from "../multinationals/dto/create-multinational.dto";
import { SubmissionAutofillService } from "./submission-autofill.service";

/** DRAFT and CHANGES_REQUESTED are the only two states a user may edit or
 * submit from — every other transition below is admin-only and enforced
 * here, never left to "the frontend just doesn't show that button". */
const VALID_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  [SubmissionStatus.DRAFT]: [SubmissionStatus.SUBMITTED],
  [SubmissionStatus.SUBMITTED]: [SubmissionStatus.UNDER_REVIEW],
  [SubmissionStatus.UNDER_REVIEW]: [SubmissionStatus.APPROVED, SubmissionStatus.CHANGES_REQUESTED, SubmissionStatus.REJECTED],
  [SubmissionStatus.CHANGES_REQUESTED]: [SubmissionStatus.SUBMITTED],
  [SubmissionStatus.APPROVED]: [],
  [SubmissionStatus.REJECTED]: [],
};

const VALIDATION_DTO: Record<EntityKind, new () => object> = {
  [EntityKind.STARTUP]: CreateStartupDto,
  [EntityKind.INVESTOR]: CreateInvestorDto,
  [EntityKind.HUB]: CreateHubDto,
  [EntityKind.RESEARCH]: CreateResearchDto,
  [EntityKind.MULTINATIONAL]: CreateMultinationalDto,
};

@Injectable()
export class SubmissionsService {
  private publishersByKind: Map<EntityKind, SubmissionPublisher>;

  constructor(
    @InjectRepository(Submission) private readonly repo: Repository<Submission>,
    @InjectRepository(SubmissionReviewEvent) private readonly events: Repository<SubmissionReviewEvent>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activity: ActivityService,
    private readonly autofillService: SubmissionAutofillService,
    startupPublisher: StartupSubmissionPublisher,
    investorPublisher: InvestorSubmissionPublisher,
    hubPublisher: HubSubmissionPublisher,
    researchPublisher: ResearchSubmissionPublisher,
    multinationalPublisher: MultinationalSubmissionPublisher,
  ) {
    const publishers: SubmissionPublisher[] = [startupPublisher, investorPublisher, hubPublisher, researchPublisher, multinationalPublisher];
    this.publishersByKind = new Map(publishers.map((p) => [p.kind, p]));
  }

  // ---------------------------------------------------------------- reads
  findForUser(userId: string): Promise<Submission[]> {
    return this.repo.find({ where: { userId }, order: { updatedAt: "DESC" } });
  }

  async findOneForUser(userId: string, id: string): Promise<Submission> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Submission not found");
    if (item.userId !== userId) throw new ForbiddenException("You do not have access to this submission");
    return item;
  }

  async findAllAdmin(query: FindSubmissionsQueryDto): Promise<Submission[]> {
    const qb = this.repo.createQueryBuilder("s");
    if (query.status) qb.andWhere("s.status = :status", { status: query.status });
    if (query.kind) qb.andWhere("s.kind = :kind", { kind: query.kind });
    if (query.search) qb.andWhere("s.title ILIKE :q", { q: `%${query.search}%` });
    qb.orderBy("s.updatedAt", (query.order ?? "desc").toUpperCase() as "ASC" | "DESC");
    return qb.getMany();
  }

  async findOneAdmin(id: string): Promise<Submission> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Submission not found");
    return item;
  }

  async kpis(): Promise<Record<string, number>> {
    const rows = await this.repo.createQueryBuilder("s").select("s.status", "status").addSelect("COUNT(*)", "count").groupBy("s.status").getRawMany<{ status: SubmissionStatus; count: string }>();
    const byStatus: Record<string, number> = { total: 0 };
    for (const status of Object.values(SubmissionStatus)) byStatus[status] = 0;
    for (const r of rows) { byStatus[r.status] = Number(r.count); byStatus.total += Number(r.count); }
    return byStatus;
  }

  history(submissionId: string): Promise<SubmissionReviewEvent[]> {
    return this.events.find({ where: { submissionId }, order: { createdAt: "ASC" } });
  }

  // ------------------------------------------------------------ user-side
  async create(userId: string, dto: CreateSubmissionDto): Promise<Submission> {
    const saved = await this.repo.save(this.repo.create({ userId, kind: dto.kind, payload: {}, status: SubmissionStatus.DRAFT }));
    await this.events.save(this.events.create({ submissionId: saved.id, eventType: SubmissionEventType.DRAFT_CREATED, actorUserId: userId }));
    return saved;
  }

  async update(userId: string, id: string, dto: UpdateSubmissionDto): Promise<Submission> {
    const item = await this.findOneForUser(userId, id);
    if (item.status !== SubmissionStatus.DRAFT && item.status !== SubmissionStatus.CHANGES_REQUESTED) {
      throw new BadRequestException(`Cannot edit a submission with status ${item.status}`);
    }
    if (dto.payload) item.payload = { ...item.payload, ...dto.payload };
    if (dto.currentStep !== undefined) item.currentStep = dto.currentStep;
    if (dto.completionPercentage !== undefined) item.completionPercentage = dto.completionPercentage;
    item.title = dto.title ?? (typeof item.payload.name === "string" ? item.payload.name : item.title);
    return this.repo.save(item);
  }

  /** Extracts fields from an uploaded document but never touches
   * item.payload — the merge-vs-conflict decision stays entirely
   * client-side, and the actual write goes through update() (PATCH :id)
   * so AI-extracted values get exactly the same treatment as manual
   * entry, with no separate validation path. */
  async autofill(userId: string, id: string, file: Express.Multer.File | undefined): Promise<{ fields: Record<string, unknown> }> {
    const item = await this.findOneForUser(userId, id);
    if (item.status !== SubmissionStatus.DRAFT && item.status !== SubmissionStatus.CHANGES_REQUESTED) {
      throw new BadRequestException(`Cannot edit a submission with status ${item.status}`);
    }
    const fields = await this.autofillService.extract(item.kind, file);
    return { fields };
  }

  async remove(userId: string, id: string): Promise<void> {
    const item = await this.findOneForUser(userId, id);
    if (item.status !== SubmissionStatus.DRAFT) throw new BadRequestException("Only drafts can be deleted");
    await this.events.delete({ submissionId: id });
    await this.repo.delete(id);
  }

  async submit(userId: string, id: string): Promise<Submission> {
    const item = await this.findOneForUser(userId, id);
    this.assertTransition(item.status, SubmissionStatus.SUBMITTED);
    await this.assertPayloadValid(item.kind, item.payload);

    const wasResubmit = item.status === SubmissionStatus.CHANGES_REQUESTED;
    item.status = SubmissionStatus.SUBMITTED;
    item.submittedAt = new Date();
    const saved = await this.repo.save(item);

    await this.events.save(this.events.create({
      submissionId: id, eventType: wasResubmit ? SubmissionEventType.RESUBMITTED : SubmissionEventType.SUBMITTED, actorUserId: userId,
    }));
    await this.activity.log(userId, wasResubmit ? ActivityType.SUBMISSION_RESUBMITTED : ActivityType.SUBMISSION_SENT,
      `${wasResubmit ? "Resubmitted" : "Submitted"} "${saved.title ?? "a listing"}" for review`, "/submissions");
    return saved;
  }

  // ------------------------------------------------------------- admin-side
  async startReview(adminUserId: string, id: string): Promise<Submission> {
    const item = await this.findOneAdmin(id);
    this.assertTransition(item.status, SubmissionStatus.UNDER_REVIEW);
    item.status = SubmissionStatus.UNDER_REVIEW;
    item.reviewStartedAt = new Date();
    item.reviewedByUserId = adminUserId;
    const saved = await this.repo.save(item);
    await this.events.save(this.events.create({ submissionId: id, eventType: SubmissionEventType.REVIEW_STARTED, actorUserId: adminUserId }));
    return saved;
  }

  async requestChanges(adminUserId: string, id: string, dto: RequestChangesDto): Promise<Submission> {
    const item = await this.findOneAdmin(id);
    this.assertTransition(item.status, SubmissionStatus.CHANGES_REQUESTED);
    item.status = SubmissionStatus.CHANGES_REQUESTED;
    item.reviewerNote = dto.message;
    item.reviewedAt = new Date();
    item.reviewedByUserId = adminUserId;
    const saved = await this.repo.save(item);
    await this.events.save(this.events.create({ submissionId: id, eventType: SubmissionEventType.CHANGES_REQUESTED, actorUserId: adminUserId, message: dto.message, section: dto.section }));
    await this.activity.log(item.userId, ActivityType.SUBMISSION_CHANGES_REQUESTED, `Changes requested on "${saved.title ?? "your listing"}"`, "/submissions");
    return saved;
  }

  async reject(adminUserId: string, id: string, dto: RejectDto): Promise<Submission> {
    const item = await this.findOneAdmin(id);
    this.assertTransition(item.status, SubmissionStatus.REJECTED);
    item.status = SubmissionStatus.REJECTED;
    item.reviewerNote = dto.reason;
    item.reviewedAt = new Date();
    item.reviewedByUserId = adminUserId;
    const saved = await this.repo.save(item);
    await this.events.save(this.events.create({ submissionId: id, eventType: SubmissionEventType.REJECTED, actorUserId: adminUserId, message: dto.reason }));
    await this.activity.log(item.userId, ActivityType.SUBMISSION_REJECTED, `"${saved.title ?? "Your listing"}" was not approved`, "/submissions");
    return saved;
  }

  /** The consequential one: validates, publishes into the real normalized
   * schema, grants ownership and marks APPROVED — all inside one DB
   * transaction. Any failure rolls the whole thing back, so an APPROVED
   * submission with no corresponding directory row can never happen. */
  async approve(adminUserId: string, id: string): Promise<Submission> {
    const item = await this.findOneAdmin(id);
    this.assertTransition(item.status, SubmissionStatus.APPROVED);
    if (item.userId === adminUserId) throw new ForbiddenException("You cannot approve your own submission");
    await this.assertPayloadValid(item.kind, item.payload);

    const publisher = this.publishersByKind.get(item.kind);
    if (!publisher) throw new BadRequestException(`No publisher registered for ${item.kind}`);

    const saved = await this.dataSource.transaction(async (manager) => {
      const entityId = await publisher.publish(manager, item.payload);

      await manager.getRepository(EntityMembership).save(manager.getRepository(EntityMembership).create({
        userId: item.userId, kind: item.kind, entityId, role: MembershipRole.OWNER,
      }));

      item.status = SubmissionStatus.APPROVED;
      item.publishedEntityId = entityId;
      item.reviewedAt = new Date();
      item.reviewedByUserId = adminUserId;
      const savedSubmission = await manager.getRepository(Submission).save(item);

      await manager.getRepository(SubmissionReviewEvent).save(manager.getRepository(SubmissionReviewEvent).create({
        submissionId: id, eventType: SubmissionEventType.APPROVED, actorUserId: adminUserId,
      }));

      return savedSubmission;
    });

    await this.activity.log(item.userId, ActivityType.SUBMISSION_APPROVED, `"${saved.title ?? "Your listing"}" was approved and published`, "/my-organizations");
    return saved;
  }

  // ------------------------------------------------------------- internals
  private assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move a submission from ${from} to ${to}`);
    }
  }

  /** Re-validates the payload against the same DTO the real create()
   * endpoint for that entity type uses — required-field validation never
   * lives only in the frontend, and runs again here at approval time so a
   * payload edited/corrupted between submit and approve can't slip through. */
  private async assertPayloadValid(kind: EntityKind, payload: Record<string, unknown>): Promise<void> {
    const dtoClass = VALIDATION_DTO[kind];
    const instance = plainToInstance(dtoClass, payload);
    const errors = await validate(instance, { skipMissingProperties: false, whitelist: false });
    if (errors.length) {
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      throw new BadRequestException({ message: messages.length ? messages : ["Submission payload is incomplete"], error: "Bad Request", statusCode: 400 });
    }
  }
}
