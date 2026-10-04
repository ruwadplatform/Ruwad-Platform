import { MigrationInterface, QueryRunner } from "typeorm";

/** Phase 1C — ML training-data infrastructure. Append-only record of real
 * outcomes (funding rounds, revenue updates, regulatory progress, shutdown,
 * ...) that happened to a startup after it was scored. Purely additive,
 * no relation to any existing table beyond a plain indexed startupId (same
 * no-DB-FK convention as every other table in this schema). */
export class AddMlOutcomeEvents1790800000000 implements MigrationInterface {
    name = 'AddMlOutcomeEvents1790800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."startup_outcome_events_eventtype_enum" AS ENUM('FUNDING_ROUND', 'REVENUE_UPDATE', 'CUSTOMER_COUNT_UPDATE', 'ACTIVE_USERS_UPDATE', 'REGULATORY_MILESTONE', 'REGULATORY_APPROVAL', 'COMMERCIAL_LAUNCH', 'PARTNERSHIP_SIGNED', 'MARKET_ENTRY', 'TEAM_SIZE_UPDATE', 'SHUTDOWN', 'ACQUISITION', 'IPO', 'OTHER')`);
        await queryRunner.query(`CREATE TYPE "public"."startup_outcome_events_source_enum" AS ENUM('FOUNDER_REPORTED', 'ADMIN_ENTERED', 'VERIFIED_DOCUMENT', 'PUBLIC_SOURCE', 'SYSTEM_DERIVED')`);
        await queryRunner.query(`CREATE TABLE "startup_outcome_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "startupId" uuid NOT NULL, "eventType" "public"."startup_outcome_events_eventtype_enum" NOT NULL, "eventDate" date NOT NULL, "valueNumeric" numeric(14,2), "valueText" character varying, "source" "public"."startup_outcome_events_source_enum" NOT NULL, "verified" boolean NOT NULL DEFAULT false, "sourceDocumentId" uuid, "sourceUrl" character varying, "notes" text, "createdByUserId" uuid, CONSTRAINT "PK_startup_outcome_events" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_outcome_events_startupId" ON "startup_outcome_events" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_startup_outcome_events_eventType" ON "startup_outcome_events" ("eventType")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_outcome_events_eventType"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_startup_outcome_events_startupId"`);
        await queryRunner.query(`DROP TABLE "startup_outcome_events"`);
        await queryRunner.query(`DROP TYPE "public"."startup_outcome_events_source_enum"`);
        await queryRunner.query(`DROP TYPE "public"."startup_outcome_events_eventtype_enum"`);
    }
}
