import { MigrationInterface, QueryRunner } from "typeorm";

/** Adds EXPERIMENTAL to the model status enum — for exploratory models trained on REAL
 * data below the production readiness gate. Additive; no row changes. Postgres cannot
 * remove an enum value, so down() is intentionally a no-op. */
export class AddExperimentalModelStatus1793200000000 implements MigrationInterface {
    name = "AddExperimentalModelStatus1793200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."ml_models_status_enum" ADD VALUE IF NOT EXISTS 'EXPERIMENTAL'`);
    }

    public async down(): Promise<void> {
        // enum values cannot be dropped in Postgres; leaving EXPERIMENTAL unused is harmless
    }
}
