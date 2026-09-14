import { SetMetadata } from "@nestjs/common";
import { EntityKind } from "../enums";

export const OWNED_ENTITY_KIND_KEY = "ownedEntityKind";

/** Marks a route as requiring the caller to own the entity kind named here
 * (the entity id is read from the ":id" route param) unless their role is
 * RUWAD_ADMIN/SUPER_ADMIN — see OwnershipGuard. */
export const OwnedEntity = (kind: EntityKind) => SetMetadata(OWNED_ENTITY_KIND_KEY, kind);
