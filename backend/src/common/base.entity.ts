import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/** Common id + timestamp columns for every major entity. Kept as a plain
 * abstract base (not decorated itself, TypeORM applies the decorators at
 * the point of use) rather than duplicated on every entity file. */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
