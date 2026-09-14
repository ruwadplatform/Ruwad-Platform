import { Column, Entity } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** Small-image storage (logos only — see UploadsService for the size/type
 * limits enforced at upload time) directly in Postgres. No object-storage
 * provider (S3 etc.) is configured for this project; this table is the
 * genuinely-persistent alternative — the same embedded/managed Postgres
 * instance every other table already relies on, not a placeholder. Never
 * used for large documents (Data Room files etc.) — those stay explicitly
 * out of scope per the platform's no-fake-file-storage rule. */
@Entity("uploaded_images")
export class UploadedImage extends BaseEntity {
  @Column()
  mimeType!: string;

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "int" })
  size!: number;

  @Column({ type: "uuid" })
  uploadedByUserId!: string;
}
