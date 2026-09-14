import { Column, Entity, Index, Unique } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind, DataRoomAccessStatus } from "../common/enums";

/** Tracks one user's access-request lifecycle for one entity's Data Room —
 * never issued for EntityKind.RESEARCH (explicit product rule: Research &
 * Academia has no Data Room at all; enforced in the service, not here).
 * File storage/upload is explicitly out of scope this phase. */
@Entity("data_room_access_requests")
@Unique(["userId", "kind", "entityId"])
export class DataRoomAccess extends BaseEntity {
  @Index()
  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "enum", enum: EntityKind })
  kind!: EntityKind;

  @Index()
  @Column({ type: "uuid" })
  entityId!: string;

  @Column({ type: "enum", enum: DataRoomAccessStatus, default: DataRoomAccessStatus.REQUESTED })
  status!: DataRoomAccessStatus;

  @Column({ type: "timestamptz", nullable: true })
  ndaSignedAt?: Date;
}
