import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DataRoomAccess } from "./data-room-access.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { EntityKind, DataRoomAccessStatus, UserRole } from "../common/enums";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { UsersService } from "../users/users.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { EmailService } from "../email/email.service";

const REQUEST_TYPE = "Data Room Access";
const OWNER_REVIEWABLE_STATUSES: DataRoomAccessStatus[] = [DataRoomAccessStatus.APPROVED, DataRoomAccessStatus.REJECTED];

export interface DataRoomDocumentView {
  id: string;
  name: string;
  onFile: boolean;
}

export interface DataRoomRequestView {
  id: string;
  kind: EntityKind;
  entityId: string;
  entityName: string;
  entitySlug: string;
  requesterName: string;
  requesterEmail: string;
  requestType: string;
  status: DataRoomAccessStatus;
  requestedAt: Date;
  updatedAt: Date;
}

function isPlatformAdmin(actor: AuthUser): boolean {
  return actor.role === UserRole.RUWAD_ADMIN || actor.role === UserRole.SUPER_ADMIN;
}

/** Access model, in one place: a DataRoomAccess row's status is the only
 * thing that unlocks a Data Room for a requester (APPROVED). The entity's
 * OWNER (EntityMembership role = OWNER) and platform admins can always view
 * it and are the only parties who can change a request's status. Every
 * check here runs server-side — the frontend only reflects the result. */
@Injectable()
export class DataRoomService {
  private readonly logger = new Logger(DataRoomService.name);

  constructor(
    @InjectRepository(DataRoomAccess) private readonly repo: Repository<DataRoomAccess>,
    @InjectRepository(DocumentRef) private readonly documents: Repository<DocumentRef>,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly emailService: EmailService,
  ) {}

  /** The requester's own requests, each with its entity's display name. */
  async findForUser(userId: string): Promise<(DataRoomAccess & { entityName: string | null })[]> {
    const rows = await this.repo.find({ where: { userId }, order: { createdAt: "DESC" } });
    return Promise.all(rows.map(async (r) => {
      const { name } = await this.organizationsService.findOwnerAndEntity(r.kind, r.entityId);
      return Object.assign(r, { entityName: name });
    }));
  }

  findAllPending(): Promise<DataRoomAccess[]> {
    return this.repo.find({ where: { status: DataRoomAccessStatus.REQUESTED }, order: { createdAt: "ASC" } });
  }

  /** Requests targeting entities this user OWNS — and nothing else. The
   * entity set comes from EntityMembership (role = OWNER), so a user can
   * never see requests for an entity they don't own. */
  async findOwnerRequests(ownerUserId: string): Promise<DataRoomRequestView[]> {
    const owned = (await this.organizationsService.findOwnedEntityRefs(ownerUserId)).filter((r) => r.kind !== EntityKind.RESEARCH);
    if (!owned.length) return [];
    const rows = await this.repo.find({
      where: owned.map((o) => ({ kind: o.kind, entityId: o.entityId })),
      order: { createdAt: "DESC" },
    });
    const refByEntity = new Map(owned.map((o) => [`${o.kind}:${o.entityId}`, o]));
    const requesters = new Map<string, { name: string; email: string }>();
    for (const userId of new Set(rows.map((r) => r.userId))) {
      try {
        const u = await this.usersService.findByIdOrThrow(userId);
        requesters.set(userId, { name: `${u.firstName} ${u.lastName}`, email: u.email });
      } catch {
        requesters.set(userId, { name: "Unknown user", email: "" });
      }
    }
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      entityId: r.entityId,
      entityName: refByEntity.get(`${r.kind}:${r.entityId}`)?.name ?? "",
      entitySlug: refByEntity.get(`${r.kind}:${r.entityId}`)?.slug ?? "",
      requesterName: requesters.get(r.userId)?.name ?? "Unknown user",
      requesterEmail: requesters.get(r.userId)?.email ?? "",
      requestType: REQUEST_TYPE,
      status: r.status,
      requestedAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async requestAccess(userId: string, kind: EntityKind, entityId: string): Promise<DataRoomAccess> {
    if (kind === EntityKind.RESEARCH) throw new BadRequestException("Research & Academia listings have no Data Room");
    const existing = await this.repo.findOne({ where: { userId, kind, entityId } });
    if (existing) return existing;

    const { ownerUserId, name } = await this.organizationsService.findOwnerAndEntity(kind, entityId);
    if (name === null) throw new NotFoundException("Profile not found");
    if (ownerUserId === userId) throw new BadRequestException("You own this profile — its Data Room is already open to you");

    let saved: DataRoomAccess;
    try {
      saved = await this.repo.save(this.repo.create({ userId, kind, entityId, status: DataRoomAccessStatus.REQUESTED }));
    } catch (e) {
      // Concurrent duplicate request — the (userId, kind, entityId) unique
      // constraint already guarantees one row; return it instead of a 500.
      const again = await this.repo.findOne({ where: { userId, kind, entityId } });
      if (again) return again;
      throw e;
    }

    // Notify the profile's owner, resolved from EntityMembership — never
    // the global admin inbox. Never lets a lookup/send failure affect the
    // already-successful save above.
    try {
      if (!ownerUserId) {
        this.logger.warn(`Data Room request ${saved.id}: no owner membership found for ${kind}/${entityId} — notification skipped.`);
      } else {
        const [owner, requester, ownerSettings] = await Promise.all([
          this.usersService.findByIdOrThrow(ownerUserId),
          this.usersService.findByIdOrThrow(userId),
          this.usersService.getOrCreateSettings(ownerUserId),
        ]);
        if (ownerSettings.emailNotifications) {
          await this.emailService.sendDataRoomRequested({
            to: owner.email,
            requesterName: `${requester.firstName} ${requester.lastName}`,
            requesterEmail: requester.email,
            profileName: name,
            requestedAt: saved.createdAt,
          });
        }
      }
    } catch (e) {
      this.logger.error(`Data Room request notification failed for ${saved.id}: ${e instanceof Error ? e.message : "unknown error"}`);
    }

    return saved;
  }

  /** Whether `actor` may see this entity's Data Room and act on its
   * requests: platform admin, or the entity's OWNER (strict role check). */
  private async canManage(actor: AuthUser, kind: EntityKind, entityId: string): Promise<boolean> {
    if (isPlatformAdmin(actor)) return true;
    return this.organizationsService.isEntityOwner(actor.userId, kind, entityId);
  }

  /** Document rows are only ever returned to an APPROVED requester, the
   * entity's owner, or an admin — a LOCKED/pending/rejected caller gets an
   * empty list no matter what the frontend does. */
  async status(actor: AuthUser, kind: EntityKind, entityId: string): Promise<{ status: DataRoomAccessStatus; documents: DataRoomDocumentView[]; isOwner: boolean }> {
    const [access, privileged, isOwner] = await Promise.all([
      this.repo.findOne({ where: { userId: actor.userId, kind, entityId } }),
      this.canManage(actor, kind, entityId),
      this.organizationsService.isEntityOwner(actor.userId, kind, entityId),
    ]);
    const status = access?.status ?? DataRoomAccessStatus.LOCKED;
    const unlocked = privileged || status === DataRoomAccessStatus.APPROVED;
    const rows = unlocked ? await this.documents.find({ where: { entityType: kind, entityId } }) : [];
    // Only what the Data Room UI renders — no entity ids, storage details or timestamps.
    const documents = rows.map((d) => ({ id: d.id, name: d.name, onFile: d.onFile }));
    return { status, documents, isOwner };
  }

  async review(actor: AuthUser, id: string, status: DataRoomAccessStatus): Promise<DataRoomAccess> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException("Access request not found");

    // Authorization is resolved from the request's own (kind, entityId),
    // never from anything the client sends.
    if (!(await this.canManage(actor, item.kind, item.entityId))) {
      throw new ForbiddenException("You do not own this profile, so you cannot review its Data Room requests");
    }
    if (!isPlatformAdmin(actor) && !OWNER_REVIEWABLE_STATUSES.includes(status)) {
      throw new BadRequestException("Owners can only approve or reject a request");
    }
    // No-op re-submission (e.g. double click): nothing to save or email.
    if (item.status === status) return item;

    item.status = status;
    if (status === DataRoomAccessStatus.APPROVED) item.ndaSignedAt = new Date();
    const saved = await this.repo.save(item);

    // Notify the original requester only — the owner already got their
    // request email when this row was created, not again here.
    if (status === DataRoomAccessStatus.APPROVED || status === DataRoomAccessStatus.REJECTED) {
      try {
        const [requester, requesterSettings, { name }] = await Promise.all([
          this.usersService.findByIdOrThrow(saved.userId),
          this.usersService.getOrCreateSettings(saved.userId),
          this.organizationsService.findOwnerAndEntity(saved.kind, saved.entityId),
        ]);
        if (requesterSettings.emailNotifications) {
          await this.emailService.sendDataRoomReviewed({
            to: requester.email,
            profileName: name ?? "the profile",
            approved: status === DataRoomAccessStatus.APPROVED,
            kind: saved.kind, entityId: saved.entityId,
            reviewedAt: new Date(),
          });
        }
      } catch (e) {
        this.logger.error(`Data Room review notification failed for ${saved.id}: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    return saved;
  }
}
