import { Injectable } from "@nestjs/common";
import { EntityKind } from "../common/enums";
import { OrganizationsService } from "../organizations/organizations.service";
import { Access, baseAccess, Viewer } from "./viewer";

/** Turns "who is asking" into "what may they see of THIS record". Ownership is per record (an entity_memberships row with role OWNER), so a member who owns one startup
 * is only an owner of that startup. */
@Injectable()
export class AccessService {
  constructor(private readonly organizations: OrganizationsService) {}

  async forRecord(viewer: Viewer, kind: EntityKind, entityId: string): Promise<Access> {
    const base = baseAccess(viewer);
    if (base !== "member") return base;
    return (await this.organizations.isEntityOwner(viewer.userId!, kind, entityId)) ? "owner" : "member";
  }

  /** For list and report responses, where no field depends on owning the record. */
  forList(viewer: Viewer): Access {
    return baseAccess(viewer);
  }
}
