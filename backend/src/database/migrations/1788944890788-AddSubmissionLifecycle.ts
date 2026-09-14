import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubmissionLifecycle1788944890788 implements MigrationInterface {
    name = 'AddSubmissionLifecycle1788944890788'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."submission_review_events_eventtype_enum" AS ENUM('DRAFT_CREATED', 'SUBMITTED', 'REVIEW_STARTED', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'REJECTED')`);
        await queryRunner.query(`CREATE TABLE "submission_review_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submissionId" uuid NOT NULL, "eventType" "public"."submission_review_events_eventtype_enum" NOT NULL, "actorUserId" uuid, "message" text, "section" character varying, CONSTRAINT "PK_46634f2caa11e45ee1222a4bd87" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c8887fbdaa9c62089333d34fb2" ON "submission_review_events" ("submissionId") `);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "title" character varying`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "currentStep" character varying`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "completionPercentage" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "submittedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "reviewStartedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "reviewedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "reviewedByUserId" uuid`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "publishedEntityId" uuid`);
        await queryRunner.query(`ALTER TABLE "submissions" ADD "version" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "payload" SET DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_type_enum" RENAME TO "activity_logs_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_type_enum" AS ENUM('watchlist_add', 'watchlist_remove', 'search_saved', 'intro_submitted', 'listing_edited', 'profile_updated', 'submission_sent', 'submission_changes_requested', 'submission_resubmitted', 'submission_approved', 'submission_rejected')`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ALTER COLUMN "type" TYPE "public"."activity_logs_type_enum" USING "type"::"text"::"public"."activity_logs_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_type_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."activity_logs_type_enum_old" AS ENUM('watchlist_add', 'watchlist_remove', 'search_saved', 'intro_submitted', 'listing_edited', 'profile_updated')`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ALTER COLUMN "type" TYPE "public"."activity_logs_type_enum_old" USING "type"::"text"::"public"."activity_logs_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."activity_logs_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."activity_logs_type_enum_old" RENAME TO "activity_logs_type_enum"`);
        await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED'`);
        await queryRunner.query(`ALTER TABLE "submissions" ALTER COLUMN "payload" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "publishedEntityId"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "reviewedByUserId"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "reviewedAt"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "reviewStartedAt"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "submittedAt"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "completionPercentage"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "currentStep"`);
        await queryRunner.query(`ALTER TABLE "submissions" DROP COLUMN "title"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c8887fbdaa9c62089333d34fb2"`);
        await queryRunner.query(`DROP TABLE "submission_review_events"`);
        await queryRunner.query(`DROP TYPE "public"."submission_review_events_eventtype_enum"`);
    }

}
