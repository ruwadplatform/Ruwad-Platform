import { MigrationInterface, QueryRunner } from "typeorm";

/** Adds BACKFILL to the score-trigger enum so the existing-startup backfill is recorded as what it is in startup_score_history.
 * Additive; no row changes. Postgres cannot remove an enum value, so down() is intentionally a no-op. */
export class AddBackfillScoreTrigger1793400000000 implements MigrationInterface {
    name = "AddBackfillScoreTrigger1793400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."startup_score_history_triggeredby_enum" ADD VALUE IF NOT EXISTS 'BACKFILL'`);
    }

    public async down(): Promise<void> {
        // enum values cannot be dropped in Postgres; leaving BACKFILL unused is harmless
    }
}
