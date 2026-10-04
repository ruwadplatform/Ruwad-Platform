import { MigrationInterface, QueryRunner } from "typeorm";

/** Phase 1C — ML training-data infrastructure. Append-only, immutable-once-
 * written record of what RUWĀD knew about a startup at one point in time —
 * the frozen feature side of a future outcome-prediction model's training
 * examples. Purely additive. */
export class AddMlFeatureSnapshots1790900000000 implements MigrationInterface {
    name = 'AddMlFeatureSnapshots1790900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."startup_ml_feature_snapshots_snapshotsource_enum" AS ENUM('MATERIAL_CHANGE', 'ADMIN_MANUAL', 'BACKFILLED_CURRENT_STATE', 'PUBLISHED')`);
        await queryRunner.query(`CREATE TABLE "startup_ml_feature_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "snapshotAt" TIMESTAMP WITH TIME ZONE NOT NULL, "scoreVersion" character varying NOT NULL, "featureSchemaVersion" character varying NOT NULL, "features" jsonb NOT NULL, "provenanceSummary" jsonb NOT NULL, "dataConfidence" numeric(3,2), "scoreStatus" character varying NOT NULL, "startupStage" character varying NOT NULL, "category" character varying NOT NULL, "snapshotSource" "public"."startup_ml_feature_snapshots_snapshotsource_enum" NOT NULL, "reason" character varying, CONSTRAINT "PK_startup_ml_feature_snapshots" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_ml_feature_snapshots_startupId" ON "startup_ml_feature_snapshots" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_ml_feature_snapshots_snapshotAt" ON "startup_ml_feature_snapshots" ("snapshotAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_ml_feature_snapshots_snapshotAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_ml_feature_snapshots_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_ml_feature_snapshots"`);
        await queryRunner.query(`DROP TYPE "public"."startup_ml_feature_snapshots_snapshotsource_enum"`);
    }
}
