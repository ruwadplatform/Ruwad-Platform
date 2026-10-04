import { MigrationInterface, QueryRunner } from "typeorm";

/** Cohort 3 Phase 0 — records WHY a snapshot's date was chosen. One new enum
 * type and one new NULLABLE column on startup_ml_feature_snapshots. Existing
 * rows keep NULL (= not yet declared); nothing is altered, removed or
 * back-filled here, and nothing touches scoring or the public RUWĀD Score. */
export class AddSnapshotSelectionMethod1793000000000 implements MigrationInterface {
    name = 'AddSnapshotSelectionMethod1793000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."startup_ml_feature_snapshots_selectionmethod_enum" AS ENUM('FIXED_CALENDAR_GRID', 'LEGACY_OUTCOME_AWARE', 'OTHER_PREDECLARED')`);
        await queryRunner.query(`ALTER TABLE "startup_ml_feature_snapshots" ADD "selectionMethod" "public"."startup_ml_feature_snapshots_selectionmethod_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startup_ml_feature_snapshots" DROP COLUMN "selectionMethod"`);
        await queryRunner.query(`DROP TYPE "public"."startup_ml_feature_snapshots_selectionmethod_enum"`);
    }
}
