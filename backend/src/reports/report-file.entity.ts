import { Column, Entity } from "typeorm";
import { BaseEntity } from "../common/base.entity";

/** A submitted report PDF, kept in Postgres like the platform's other stored files (no object storage exists).
 * Private by default: it is only ever served to its owner, to a reviewer holding a valid review token, or — once the
 * linked report is published — publicly through that report. `data` is never selected unless a file is being served. */
@Entity("report_files")
export class ReportFile extends BaseEntity {
  @Column({ type: "uuid" }) ownerUserId!: string;
  @Column() fileName!: string;
  @Column({ default: "application/pdf" }) mimeType!: string;
  @Column({ type: "int" }) size!: number;
  @Column() sha256!: string;
  @Column({ type: "bytea", select: false }) data!: Buffer;
}
