import { MigrationInterface, QueryRunner } from "typeorm";

/** Replaces the placeholder RUWĀD Score (every startup hardcoded to six
 * subscores of 70, composite 700/1000 — see startups.service.ts's old
 * `create()`) with a real, explainable scoring architecture on a 0.0-10.0
 * scale.
 *
 * The seven old score columns are dropped, not preserved: none of them
 * ever held a genuine assessment for any row (they were always the same
 * hardcoded 70/70/70/70/70/70/700 for every startup, admin-created or
 * founder-submitted), so there is no real historical value to carry
 * forward, and every existing startup lands on scoreStatus='NOT_CALCULATED'
 * / ruwadScore=NULL below — never a divided-by-100 reinterpretation of the
 * old placeholder as if it were a real score. */
export class AddRealStartupScoring1790600000000 implements MigrationInterface {
    name = 'AddRealStartupScoring1790600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ---- startups: drop the placeholder columns, add the new score cache ----
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "score"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreGrowth"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreFinancial"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreMarket"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreTeam"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreRegulatory"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreTech"`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "ruwadScore" numeric(4,2)`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreStatus" character varying NOT NULL DEFAULT 'NOT_CALCULATED'`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreConfidence" numeric(3,2)`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreVersion" character varying`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreCalculatedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE INDEX "IDX_startups_ruwadScore" ON "startups" ("ruwadScore")`);

        // ---- startup_score_history: append-only, one row per calculation ----
        await queryRunner.query(`CREATE TYPE "public"."startup_score_history_status_enum" AS ENUM('NOT_CALCULATED', 'INSUFFICIENT_DATA', 'CALCULATED', 'STALE', 'ERROR')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_score_history_triggeredby_enum" AS ENUM('STARTUP_CREATED', 'STARTUP_UPDATED', 'SUBMISSION_PUBLISHED', 'PITCH_DECK_PROCESSED', 'ADMIN_RECALCULATION', 'ADMIN_OVERRIDE')`);
        await queryRunner.query(`CREATE TABLE "startup_score_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "status" "public"."startup_score_history_status_enum" NOT NULL, "ruwadScore" numeric(4,2), "confidenceScore" numeric(3,2), "version" character varying NOT NULL, "factors" jsonb NOT NULL, "missingFactors" text array NOT NULL DEFAULT '{}', "triggeredBy" "public"."startup_score_history_triggeredby_enum" NOT NULL, "calculatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_startup_score_history" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_score_history_startupId" ON "startup_score_history" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_score_history_calculatedAt" ON "startup_score_history" ("calculatedAt")`);

        // ---- startup_scoring_features: current-state structured inputs, one row per startup ----
        await queryRunner.query(`CREATE TABLE "startup_scoring_features" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "features" jsonb NOT NULL DEFAULT '{}', "provenance" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_startup_scoring_features" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_startup_scoring_features_startupId" ON "startup_scoring_features" ("startupId")`);

        // ---- startup_scoring_feature_audit: append-only override trail ----
        await queryRunner.query(`CREATE TABLE "startup_scoring_feature_audit" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "featureKey" character varying NOT NULL, "previousValue" jsonb, "newValue" jsonb, "adminUserId" uuid NOT NULL, "reason" text NOT NULL, CONSTRAINT "PK_startup_scoring_feature_audit" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_scoring_feature_audit_startupId" ON "startup_scoring_feature_audit" ("startupId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_scoring_feature_audit_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_scoring_feature_audit"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_scoring_features_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_scoring_features"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_score_history_calculatedAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_score_history_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_score_history"`);
        await queryRunner.query(`DROP TYPE "public"."startup_score_history_triggeredby_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_score_history_status_enum"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startups_ruwadScore"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreCalculatedAt"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreVersion"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreConfidence"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoreStatus"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "ruwadScore"`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "score" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreGrowth" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreFinancial" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreMarket" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreTeam" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreRegulatory" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoreTech" integer NOT NULL DEFAULT 0`);
    }
}
