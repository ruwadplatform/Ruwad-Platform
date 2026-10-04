import { MigrationInterface, QueryRunner } from "typeorm";

/** Live EXPERIMENTAL inference. A current-state prediction is not tied to a historical snapshot, so:
 *  - ml_predictions.snapshotId becomes nullable (constraint relaxed; existing rows untouched);
 *  - ml_predictions.prediction becomes nullable and a new `outcome` column (default 'PREDICTED') lets an
 *    "INSUFFICIENT_DATA" answer be recorded as a marker row with NO number (never a fallback value), so a
 *    page view can tell "not enough data" from "not run yet" without calling the model again;
 *  - five nullable audit columns record what the prediction was made from: featureSchemaVersion,
 *    featureCompleteness, reliability, inputFeatures (the allow-listed vector actually sent, no PII)
 *    and inputHash (de-duplication key);
 *  - the prediction-status enum gains EXPERIMENTAL.
 * Additive/relaxing only: no row is rewritten, no column dropped. Postgres cannot remove an enum
 * value, so down() leaves EXPERIMENTAL in place. */
export class AddExperimentalPredictionFields1793300000000 implements MigrationInterface {
    name = 'AddExperimentalPredictionFields1793300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."ml_predictions_modelstatus_enum" ADD VALUE IF NOT EXISTS 'EXPERIMENTAL'`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ALTER COLUMN "snapshotId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ALTER COLUMN "prediction" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "outcome" character varying NOT NULL DEFAULT 'PREDICTED'`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "featureSchemaVersion" character varying`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "featureCompleteness" numeric(4,3)`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "reliability" character varying`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "inputFeatures" jsonb`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" ADD "inputHash" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "inputHash"`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "inputFeatures"`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "reliability"`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "featureCompleteness"`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "featureSchemaVersion"`);
        await queryRunner.query(`ALTER TABLE "ml_predictions" DROP COLUMN "outcome"`);
        // snapshotId / prediction NOT NULL are not restored: rows without them may exist by then.
    }
}
