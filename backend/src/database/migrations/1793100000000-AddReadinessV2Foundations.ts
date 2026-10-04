import { MigrationInterface, QueryRunner } from "typeorm";

/** Phase 3A — leakage-safe readiness (V2) foundations. Strictly additive:
 *  - four new tables: feature applicability, per-family outcome coverage,
 *    founder career anchors, and the founder/admin historical-submission queue;
 *  - one NOT NULL-with-default column on startup_ml_feature_snapshots
 *    (trainingEligibility) and one on startups (foundedBasis);
 *  - a metadata-only backfill of trainingEligibility from the existing
 *    selectionMethod (outcome-aware rows stay ANALYSIS_ONLY, the default).
 * No existing column is altered or dropped, no snapshot feature value, date
 * or label input is touched, no snapshot or evidence row is deleted, and
 * nothing here touches scoring or the public RUWĀD Score. */
export class AddReadinessV2Foundations1793100000000 implements MigrationInterface {
    name = 'AddReadinessV2Foundations1793100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ---- snapshots: training eligibility ----
        await queryRunner.query(`CREATE TYPE "public"."startup_ml_feature_snapshots_trainingeligibility_enum" AS ENUM('ELIGIBLE', 'ANALYSIS_ONLY', 'EXCLUDED')`);
        await queryRunner.query(`ALTER TABLE "startup_ml_feature_snapshots" ADD "trainingEligibility" "public"."startup_ml_feature_snapshots_trainingeligibility_enum" NOT NULL DEFAULT 'ANALYSIS_ONLY'`);
        await queryRunner.query(`UPDATE "startup_ml_feature_snapshots" SET "trainingEligibility" = 'ELIGIBLE' WHERE "selectionMethod" IN ('FIXED_CALENDAR_GRID', 'OTHER_PREDECLARED')`);

        // ---- startups: founding-year basis ----
        await queryRunner.query(`CREATE TYPE "public"."startups_foundedbasis_enum" AS ENUM('KNOWN', 'ESTIMATED', 'UNKNOWN')`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "foundedBasis" "public"."startups_foundedbasis_enum" NOT NULL DEFAULT 'KNOWN'`);

        // ---- feature applicability ----
        await queryRunner.query(`CREATE TYPE "public"."startup_feature_applicability_status_enum" AS ENUM('APPLICABLE', 'NOT_APPLICABLE', 'UNKNOWN')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_feature_applicability_source_enum" AS ENUM('FOUNDER_SUBMITTED', 'ADMIN_ENTERED', 'PITCH_DECK_EXTRACTED', 'VERIFIED_DOCUMENT', 'EXTERNAL_SOURCE', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TABLE "startup_feature_applicability" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "featureKey" character varying NOT NULL, "status" "public"."startup_feature_applicability_status_enum" NOT NULL, "effectiveDate" date NOT NULL, "source" "public"."startup_feature_applicability_source_enum" NOT NULL, "sourceDocumentId" uuid, "reason" text, "verified" boolean NOT NULL DEFAULT false, "createdBy" uuid, "submissionId" uuid, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokedReason" text, CONSTRAINT "PK_startup_feature_applicability" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_feature_applicability_startupId" ON "startup_feature_applicability" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_feature_applicability_submissionId" ON "startup_feature_applicability" ("submissionId")`);

        // ---- per-family outcome coverage ----
        await queryRunner.query(`CREATE TYPE "public"."startup_outcome_coverage_coveragetype_enum" AS ENUM('FUNDING', 'REVENUE', 'CUSTOMER', 'REGULATORY', 'COMMERCIALIZATION', 'PARTNERSHIP', 'MARKET_ENTRY', 'SURVIVAL')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_outcome_coverage_method_enum" AS ENUM('ADMIN_RESEARCH', 'FOUNDER_ATTESTED', 'LICENSED_DATABASE', 'PUBLIC_SOURCES', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_outcome_coverage_confidence_enum" AS ENUM('PRIMARY', 'HIGH', 'MEDIUM', 'LOW')`);
        await queryRunner.query(`CREATE TABLE "startup_outcome_coverage" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "coverageType" "public"."startup_outcome_coverage_coveragetype_enum" NOT NULL, "coverageThrough" date NOT NULL, "sourceSummary" text NOT NULL, "method" "public"."startup_outcome_coverage_method_enum" NOT NULL, "confidence" "public"."startup_outcome_coverage_confidence_enum" NOT NULL, "verifiedBy" uuid, "verifiedAt" TIMESTAMP WITH TIME ZONE, "notes" text, "createdBy" uuid, "submissionId" uuid, "revokedAt" TIMESTAMP WITH TIME ZONE, "revokedReason" text, CONSTRAINT "PK_startup_outcome_coverage" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_outcome_coverage_startupId" ON "startup_outcome_coverage" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_outcome_coverage_submissionId" ON "startup_outcome_coverage" ("submissionId")`);

        // ---- founder career anchors ----
        await queryRunner.query(`CREATE TYPE "public"."startup_founder_career_source_enum" AS ENUM('FOUNDER_SUBMITTED', 'ADMIN_ENTERED', 'PITCH_DECK_EXTRACTED', 'VERIFIED_DOCUMENT', 'EXTERNAL_SOURCE', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TABLE "startup_founder_career" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "founderName" character varying NOT NULL, "teamMemberId" uuid, "careerStartYear" integer NOT NULL, "domainStartYear" integer, "roleHistory" jsonb, "source" "public"."startup_founder_career_source_enum" NOT NULL, "sourceDocumentId" uuid, "verified" boolean NOT NULL DEFAULT false, "createdBy" uuid, "submissionId" uuid, "revokedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_startup_founder_career" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_founder_career_startupId" ON "startup_founder_career" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_founder_career_submissionId" ON "startup_founder_career" ("submissionId")`);

        // ---- founder/admin historical-submission queue ----
        await queryRunner.query(`CREATE TYPE "public"."startup_historical_submissions_kind_enum" AS ENUM('REVENUE', 'CUSTOMER_METRIC', 'TEAM_SIZE', 'FOUNDER_CAREER', 'REGULATORY_APPLICABILITY', 'REGULATORY_MILESTONE', 'FUNDING_ROUND', 'COVERAGE_ATTESTATION')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_historical_submissions_source_enum" AS ENUM('FOUNDER_SUBMITTED', 'ADMIN_ENTERED', 'PITCH_DECK_EXTRACTED', 'VERIFIED_DOCUMENT', 'EXTERNAL_SOURCE', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_historical_submissions_reviewstatus_enum" AS ENUM('PENDING_REVIEW', 'CHANGES_REQUESTED', 'VERIFIED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "startup_historical_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "kind" "public"."startup_historical_submissions_kind_enum" NOT NULL, "payload" jsonb NOT NULL, "effectiveDate" date NOT NULL, "source" "public"."startup_historical_submissions_source_enum" NOT NULL, "reviewStatus" "public"."startup_historical_submissions_reviewstatus_enum" NOT NULL DEFAULT 'PENDING_REVIEW', "submittedBy" uuid NOT NULL, "supportingDocumentId" uuid, "supportingDocumentType" character varying, "founderNote" text, "reviewedBy" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewNotes" text, "materialized" jsonb, CONSTRAINT "PK_startup_historical_submissions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_submissions_startupId" ON "startup_historical_submissions" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_submissions_reviewStatus" ON "startup_historical_submissions" ("reviewStatus")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "startup_historical_submissions"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_submissions_reviewstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_submissions_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_submissions_kind_enum"`);
        await queryRunner.query(`DROP TABLE "startup_founder_career"`);
        await queryRunner.query(`DROP TYPE "public"."startup_founder_career_source_enum"`);
        await queryRunner.query(`DROP TABLE "startup_outcome_coverage"`);
        await queryRunner.query(`DROP TYPE "public"."startup_outcome_coverage_confidence_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_outcome_coverage_method_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_outcome_coverage_coveragetype_enum"`);
        await queryRunner.query(`DROP TABLE "startup_feature_applicability"`);
        await queryRunner.query(`DROP TYPE "public"."startup_feature_applicability_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_feature_applicability_status_enum"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "foundedBasis"`);
        await queryRunner.query(`DROP TYPE "public"."startups_foundedbasis_enum"`);
        await queryRunner.query(`ALTER TABLE "startup_ml_feature_snapshots" DROP COLUMN "trainingEligibility"`);
        await queryRunner.query(`DROP TYPE "public"."startup_ml_feature_snapshots_trainingeligibility_enum"`);
    }
}
