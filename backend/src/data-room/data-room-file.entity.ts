import { Column, Entity, Index } from "typeorm";
import { BaseEntity } from "../common/base.entity";
import { EntityKind } from "../common/enums";

/** One document in an entity's Data Room, stored in Postgres (bytea) like logos are: no object-storage provider is configured for this project,
 * and this is the genuinely persistent store the rest of the app already relies on. `data` is never selected by default, so listing a Data Room
 * never loads file contents; the download path asks for it explicitly. Files are private: only the entity's owner(s) and platform admins can
 * list, download, change or delete them. */
@Entity("data_room_files")
@Index(["entityType", "entityId"])
export class DataRoomFile extends BaseEntity {
  @Column({ type: "enum", enum: EntityKind })
  entityType!: EntityKind;

  @Column({ type: "uuid" })
  entityId!: string;

  /** The title shown in the Data Room (defaults to the file's name). */
  @Column()
  name!: string;

  /** One of DATA_ROOM_CATEGORIES. A checklist category (e.g. "Pitch Deck") also drives that document's "on file" status on the profile. */
  @Column()
  category!: string;

  /** The original file name, sanitised; used only as the download name, never as a path. */
  @Column()
  fileName!: string;

  /** Decided by the server from the file type, never taken from the client. */
  @Column()
  mimeType!: string;

  @Column({ type: "int" })
  size!: number;

  @Column({ type: "bytea", select: false })
  data!: Buffer;

  @Column({ type: "uuid" })
  uploadedByUserId!: string;
}
