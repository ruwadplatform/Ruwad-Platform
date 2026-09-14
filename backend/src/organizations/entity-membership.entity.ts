import { Column, Entity, Index, Unique } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind, MembershipRole, ListingStatus, ListingVisibility } from "../common/enums";

/** Who owns/manages a directory entity, and the listing-level state (status,
 * visibility, view count) layered on top of it — kept separate from the
 * entity's own public record since ownership/listing state is per-user
 * workspace data, not part of the public directory profile. */
@Entity("entity_memberships")
@Unique(["userId", "kind", "entityId"])
export class EntityMembership extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: EntityKind })
  kind!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column({ type: "enum", enum: MembershipRole, default: MembershipRole.OWNER })
  role!: MembershipRole;

  @Column({ type: "enum", enum: ListingStatus, default: ListingStatus.PUBLISHED })
  listingStatus!: ListingStatus;

  @Column({ type: "enum", enum: ListingVisibility, default: ListingVisibility.PUBLIC })
  listingVisibility!: ListingVisibility;

  @Column({ type: "int", default: 0 })
  views!: number;
}
