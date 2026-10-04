import { MigrationInterface, QueryRunner } from "typeorm";

/** Phase 3 — historical data acquisition & import. Seven additive tables
 * (evidence, its audit trail, external identity matching, import batches,
 * staged import rows, cohorts, cohort membership), two additive nullable
 * columns on the existing startup_outcome_events (importBatchId,
 * publishedAt), and one new value added to the existing MlSnapshotSource
 * enum (HISTORICAL_RECONSTRUCTION). No existing table or column is
 * altered/removed; nothing here touches scoring or the public RUWĀD Score. */
export class AddHistoricalDataAcquisition1792000000000 implements MigrationInterface {
    name = 'AddHistoricalDataAcquisition1792000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."startup_ml_feature_snapshots_snapshotsource_enum" ADD VALUE 'HISTORICAL_RECONSTRUCTION'`);

        await queryRunner.query(`CREATE TYPE "public"."historical_import_rows_recordtype_enum" AS ENUM('FEATURE', 'OUTCOME_EVENT', 'IDENTITY')`);
        await queryRunner.query(`CREATE TABLE "historical_import_rows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "importBatchId" uuid NOT NULL, "rowNumber" integer NOT NULL, "recordType" "public"."historical_import_rows_recordtype_enum" NOT NULL, "rawRow" jsonb NOT NULL, "externalIdentityId" uuid, "status" character varying NOT NULL DEFAULT 'PENDING', "errorMessage" text, CONSTRAINT "PK_historical_import_rows" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_historical_import_rows_importBatchId" ON "historical_import_rows" ("importBatchId")`);
        await queryRunner.query(`CREATE INDEX "IDX_historical_import_rows_externalIdentityId" ON "historical_import_rows" ("externalIdentityId")`);

        await queryRunner.query(`CREATE TYPE "public"."startup_external_identities_matchedby_enum" AS ENUM('EXTERNAL_ID', 'DOMAIN', 'ALIAS', 'NORMALIZED_NAME', 'FUZZY_REVIEW', 'MANUAL')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_external_identities_matchstatus_enum" AS ENUM('MATCHED', 'UNMATCHED', 'POSSIBLE_DUPLICATE', 'REVIEW_REQUIRED')`);
        await queryRunner.query(`CREATE TABLE "startup_external_identities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid, "sourceName" character varying NOT NULL, "externalId" character varying, "externalUrl" character varying, "companyNameAtSource" character varying NOT NULL, "domain" character varying, "matchedBy" "public"."startup_external_identities_matchedby_enum", "matchConfidence" numeric(3,2), "matchStatus" "public"."startup_external_identities_matchstatus_enum" NOT NULL DEFAULT 'REVIEW_REQUIRED', "verified" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_startup_external_identities" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_external_identities_startupId" ON "startup_external_identities" ("startupId")`);

        await queryRunner.query(`CREATE TYPE "public"."historical_import_batches_sourcetype_enum" AS ENUM('FOUNDER_REPORTED', 'ADMIN_ENTERED', 'VERIFIED_DOCUMENT', 'PUBLIC_COMPANY_SOURCE', 'PUBLIC_REGULATORY_SOURCE', 'PUBLIC_NEWS_SOURCE', 'LICENSED_DATABASE', 'RESEARCH_DATABASE', 'PATENT_DATABASE', 'CLINICAL_TRIAL_REGISTRY', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TYPE "public"."historical_import_batches_status_enum" AS ENUM('UPLOADED', 'VALIDATING', 'DRY_RUN_COMPLETE', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED')`);
        await queryRunner.query(`CREATE TABLE "historical_import_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "sourceName" character varying NOT NULL, "sourceType" "public"."historical_import_batches_sourcetype_enum" NOT NULL, "fileName" character varying NOT NULL, "importedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "importedBy" uuid NOT NULL, "status" "public"."historical_import_batches_status_enum" NOT NULL DEFAULT 'UPLOADED', "rowsTotal" integer NOT NULL DEFAULT '0', "rowsAccepted" integer NOT NULL DEFAULT '0', "rowsRejected" integer NOT NULL DEFAULT '0', "rowsNeedsReview" integer NOT NULL DEFAULT '0', "dryRun" boolean NOT NULL DEFAULT false, "notes" text, "rawCsv" text NOT NULL, "summaryJson" jsonb, CONSTRAINT "PK_historical_import_batches" PRIMARY KEY ("id"))`);

        await queryRunner.query(`CREATE TYPE "public"."startup_historical_evidence_sourcetype_enum" AS ENUM('FOUNDER_REPORTED', 'ADMIN_ENTERED', 'VERIFIED_DOCUMENT', 'PUBLIC_COMPANY_SOURCE', 'PUBLIC_REGULATORY_SOURCE', 'PUBLIC_NEWS_SOURCE', 'LICENSED_DATABASE', 'RESEARCH_DATABASE', 'PATENT_DATABASE', 'CLINICAL_TRIAL_REGISTRY', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_historical_evidence_reliability_enum" AS ENUM('PRIMARY', 'HIGH', 'MEDIUM', 'LOW')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_historical_evidence_status_enum" AS ENUM('NO_CONFLICT', 'PREFERRED', 'CONFLICT', 'SUPERSEDED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "startup_historical_evidence" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "importBatchId" uuid, "fieldKey" character varying NOT NULL, "valueNumeric" numeric(18,4), "valueText" character varying, "valueBoolean" boolean, "currency" character varying, "normalizedValue" numeric(18,4), "normalizedCurrency" character varying, "fxDate" date, "fxSource" character varying, "effectiveDate" date NOT NULL, "publishedAt" date, "sourceType" "public"."startup_historical_evidence_sourcetype_enum" NOT NULL, "sourceName" character varying, "sourceUrl" character varying, "sourceDocumentId" uuid, "verified" boolean NOT NULL DEFAULT false, "verificationNotes" text, "reliability" "public"."startup_historical_evidence_reliability_enum" NOT NULL, "status" "public"."startup_historical_evidence_status_enum" NOT NULL DEFAULT 'NO_CONFLICT', "cohortSource" character varying, "collectedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdBy" uuid, CONSTRAINT "PK_startup_historical_evidence" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_evidence_startupId" ON "startup_historical_evidence" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_evidence_importBatchId" ON "startup_historical_evidence" ("importBatchId")`);

        await queryRunner.query(`CREATE TABLE "startup_historical_evidence_audit" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "evidenceId" uuid NOT NULL, "previousValue" jsonb, "newValue" jsonb, "adminUserId" uuid NOT NULL, "reason" text NOT NULL, CONSTRAINT "PK_startup_historical_evidence_audit" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_evidence_audit_evidenceId" ON "startup_historical_evidence_audit" ("evidenceId")`);

        await queryRunner.query(`CREATE TABLE "startup_historical_cohorts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying NOT NULL, "region" character varying, "category" character varying, "snapshotDate" date, "sourceDescription" text, CONSTRAINT "PK_startup_historical_cohorts" PRIMARY KEY ("id"))`);

        await queryRunner.query(`CREATE TABLE "startup_historical_cohort_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cohortId" uuid NOT NULL, "startupId" uuid NOT NULL, CONSTRAINT "PK_startup_historical_cohort_members" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_cohort_members_cohortId" ON "startup_historical_cohort_members" ("cohortId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_historical_cohort_members_startupId" ON "startup_historical_cohort_members" ("startupId")`);

        await queryRunner.query(`ALTER TABLE "startup_outcome_events" ADD "importBatchId" uuid`);
        await queryRunner.query(`ALTER TABLE "startup_outcome_events" ADD "publishedAt" date`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_outcome_events_importBatchId" ON "startup_outcome_events" ("importBatchId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_outcome_events_importBatchId"`);
        await queryRunner.query(`ALTER TABLE "startup_outcome_events" DROP COLUMN "publishedAt"`);
        await queryRunner.query(`ALTER TABLE "startup_outcome_events" DROP COLUMN "importBatchId"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_historical_cohort_members_startupId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_historical_cohort_members_cohortId"`);
        await queryRunner.query(`DROP TABLE "startup_historical_cohort_members"`);

        await queryRunner.query(`DROP TABLE "startup_historical_cohorts"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_historical_evidence_audit_evidenceId"`);
        await queryRunner.query(`DROP TABLE "startup_historical_evidence_audit"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_historical_evidence_importBatchId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_historical_evidence_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_historical_evidence"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_evidence_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_evidence_reliability_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_historical_evidence_sourcetype_enum"`);

        await queryRunner.query(`DROP TABLE "historical_import_batches"`);
        await queryRunner.query(`DROP TYPE "public"."historical_import_batches_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."historical_import_batches_sourcetype_enum"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_startup_external_identities_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_external_identities"`);
        await queryRunner.query(`DROP TYPE "public"."startup_external_identities_matchstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_external_identities_matchedby_enum"`);

        await queryRunner.query(`DROP INDEX "public"."IDX_historical_import_rows_externalIdentityId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_historical_import_rows_importBatchId"`);
        await queryRunner.query(`DROP TABLE "historical_import_rows"`);
        await queryRunner.query(`DROP TYPE "public"."historical_import_rows_recordtype_enum"`);

        // Postgres has no "remove enum value" — down() can't cleanly
        // reverse the ADD VALUE in up(). Left in place on rollback; it is
        // additive and harmless if this migration is ever reverted.
    }
}
