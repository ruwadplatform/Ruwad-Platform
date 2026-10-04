import { MigrationInterface, QueryRunner } from "typeorm";

/** Phase 2A — ML training/evaluation/shadow-prediction framework. Three
 * additive tables: the model registry (`ml_models`, status-guarded from
 * the application layer — new rows are always CANDIDATE or TEST_ONLY,
 * never ACTIVE), the training-run audit trail (`ml_training_runs`,
 * including blocked-by-readiness attempts), and shadow predictions
 * (`ml_predictions`, internal-only, never surfaced publicly, never
 * blended into startups.ruwadScore). No existing table or column changes. */
export class AddMlTrainingFramework1791000000000 implements MigrationInterface {
    name = 'AddMlTrainingFramework1791000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ml_models_status_enum" AS ENUM('TEST_ONLY', 'CANDIDATE', 'SHADOW', 'ACTIVE', 'RETIRED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "ml_models" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "modelVersion" character varying NOT NULL, "targetName" character varying NOT NULL, "targetVersion" character varying NOT NULL, "featureSchemaVersion" character varying NOT NULL, "algorithm" character varying NOT NULL, "hyperparameters" jsonb NOT NULL DEFAULT '{}', "trainingRows" integer NOT NULL, "validationRows" integer NOT NULL, "testRows" integer NOT NULL, "trainingPeriodStart" TIMESTAMP WITH TIME ZONE, "trainingPeriodEnd" TIMESTAMP WITH TIME ZONE, "metrics" jsonb NOT NULL DEFAULT '{}', "status" "public"."ml_models_status_enum" NOT NULL DEFAULT 'CANDIDATE', "artifactLocation" character varying NOT NULL, "isTestOnly" boolean NOT NULL DEFAULT false, "trainedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ml_models" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ml_models_modelVersion" ON "ml_models" ("modelVersion")`);
        await queryRunner.query(`CREATE INDEX "IDX_ml_models_targetName" ON "ml_models" ("targetName")`);

        await queryRunner.query(`CREATE TYPE "public"."ml_training_runs_status_enum" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED_NOT_READY')`);
        await queryRunner.query(`CREATE TABLE "ml_training_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "targetName" character varying NOT NULL, "targetVersion" character varying NOT NULL, "featureSchemaVersion" character varying NOT NULL, "algorithm" character varying NOT NULL, "status" "public"."ml_training_runs_status_enum" NOT NULL, "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "completedAt" TIMESTAMP WITH TIME ZONE, "datasetRows" integer, "metrics" jsonb NOT NULL DEFAULT '{}', "hyperparameters" jsonb NOT NULL DEFAULT '{}', "modelVersion" character varying, "artifactLocation" character varying, "errorMessage" text, "createdBy" character varying NOT NULL, "isTestOnly" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_ml_training_runs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ml_training_runs_targetName" ON "ml_training_runs" ("targetName")`);

        await queryRunner.query(`CREATE TYPE "public"."ml_predictions_predictiontype_enum" AS ENUM('PROBABILITY', 'REGRESSION_VALUE')`);
        await queryRunner.query(`CREATE TYPE "public"."ml_predictions_modelstatus_enum" AS ENUM('TEST_ONLY', 'CANDIDATE', 'SHADOW', 'ACTIVE', 'RETIRED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "ml_predictions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "snapshotId" uuid NOT NULL, "targetName" character varying NOT NULL, "targetVersion" character varying NOT NULL, "modelVersion" character varying NOT NULL, "prediction" numeric(10,6) NOT NULL, "predictionType" "public"."ml_predictions_predictiontype_enum" NOT NULL, "predictedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "modelStatus" "public"."ml_predictions_modelstatus_enum" NOT NULL, "actualOutcome" numeric(14,4), "evaluatedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ml_predictions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ml_predictions_startupId" ON "ml_predictions" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ml_predictions_snapshotId" ON "ml_predictions" ("snapshotId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ml_predictions_modelVersion" ON "ml_predictions" ("modelVersion")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_ml_predictions_modelVersion"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ml_predictions_snapshotId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ml_predictions_startupId"`);
        await queryRunner.query(`DROP TABLE "ml_predictions"`);
        await queryRunner.query(`DROP TYPE "public"."ml_predictions_modelstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."ml_predictions_predictiontype_enum"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_ml_training_runs_targetName"`);
        await queryRunner.query(`DROP TABLE "ml_training_runs"`);
        await queryRunner.query(`DROP TYPE "public"."ml_training_runs_status_enum"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_ml_models_targetName"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ml_models_modelVersion"`);
        await queryRunner.query(`DROP TABLE "ml_models"`);
        await queryRunner.query(`DROP TYPE "public"."ml_models_status_enum"`);
    }
}
