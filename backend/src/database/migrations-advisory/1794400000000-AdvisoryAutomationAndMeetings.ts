import { MigrationInterface, QueryRunner } from "typeorm";

/** OPT-IN MIGRATION (lives in migrations-advisory/, only listed when ADVISORY_MIGRATIONS=true; see src/database/migration-sources.ts).
 * Advisory Services, phase 4: request expiry, reminders, video meetings and attendance. Additive only: new columns on advisory_bookings, one new
 * enum value, two new tables. Nothing outside the advisory tables is touched. Local-only so far; production needs a separate, explicit go-ahead
 * and is meant to be applied together with 1794300000000-CreateAdvisoryServices in one controlled window.
 *
 * - EXPIRED: an unanswered request (or unanswered reschedule proposal) that ran out of time. Terminal; holds no slot.
 * - expiresAt + the *SentAt columns: what the scheduler claims against, so several backends running it can't send a reminder twice.
 * - needsReview + attendanceOutcome: the Needs Review queue (no NO_SHOW status: the outcome is recorded alongside the booking).
 * - meeting*: which Daily room (or simulated room) belongs to a booking. The room NAME only: tokens and URLs are never stored.
 * - advisory_meeting_attendance / advisory_webhook_events: who joined and left, and which provider events were already processed. */
export class AdvisoryAutomationAndMeetings1794400000000 implements MigrationInterface {
    name = "AdvisoryAutomationAndMeetings1794400000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        // A new enum value can't be USED in the transaction that adds it, so nothing below refers to 'EXPIRED' (the partial index only lists older values).
        await queryRunner.query(`ALTER TYPE "public"."advisory_bookings_status_enum" ADD VALUE IF NOT EXISTS 'EXPIRED'`);

        await queryRunner.query(`ALTER TABLE "advisory_bookings"
            ADD COLUMN "expiresAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "expiryWarningSentAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "reminder24hSentAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "reminder1hSentAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "needsReview" boolean NOT NULL DEFAULT false,
            ADD COLUMN "attendanceOutcome" character varying(24),
            ADD COLUMN "meetingProvider" character varying(10),
            ADD COLUMN "meetingRoomName" character varying(80),
            ADD COLUMN "meetingRoomCreatedAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "meetingRoomClosedAt" TIMESTAMP WITH TIME ZONE`);

        // Bookings that already exist (local development only so far) get the default expiry: 72 hours, but never later than 30 minutes before the start.
        await queryRunner.query(`UPDATE "advisory_bookings" SET "expiresAt" = LEAST("createdAt" + interval '72 hours', "startsAt" - interval '30 minutes') WHERE "status" IN ('PENDING', 'RESCHEDULE_PROPOSED') AND "expiresAt" IS NULL`);

        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_expiry" ON "advisory_bookings" ("expiresAt") WHERE "status" IN ('PENDING', 'RESCHEDULE_PROPOSED')`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_bookings_room" ON "advisory_bookings" ("meetingRoomName") WHERE "meetingRoomName" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_review" ON "advisory_bookings" ("startsAt") WHERE "needsReview" = true`);

        await queryRunner.query(`CREATE TABLE "advisory_meeting_attendance" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "bookingId" uuid NOT NULL, "userId" uuid NOT NULL, "role" character varying(10) NOT NULL, "sessionKey" character varying(80) NOT NULL, "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "leftAt" TIMESTAMP WITH TIME ZONE, "source" character varying(10) NOT NULL, CONSTRAINT "PK_advisory_meeting_attendance_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_attendance_range" CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_attendance_session" ON "advisory_meeting_attendance" ("bookingId", "userId", "sessionKey")`);

        await queryRunner.query(`CREATE TABLE "advisory_webhook_events" ("id" character varying(120) NOT NULL, "type" character varying(60) NOT NULL, "receivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advisory_webhook_events_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "advisory_webhook_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_attendance_session"`);
        await queryRunner.query(`DROP TABLE "advisory_meeting_attendance"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_bookings_review"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_bookings_room"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_bookings_expiry"`);
        await queryRunner.query(`ALTER TABLE "advisory_bookings"
            DROP COLUMN "meetingRoomClosedAt", DROP COLUMN "meetingRoomCreatedAt", DROP COLUMN "meetingRoomName", DROP COLUMN "meetingProvider",
            DROP COLUMN "attendanceOutcome", DROP COLUMN "needsReview", DROP COLUMN "reminder1hSentAt", DROP COLUMN "reminder24hSentAt",
            DROP COLUMN "expiryWarningSentAt", DROP COLUMN "expiresAt"`);
        // The 'EXPIRED' enum value is left in place: PostgreSQL cannot drop a single enum value, and an unused value is harmless. Any row that
        // used it must be moved to another status before the enum could ever be rebuilt.
    }
}
