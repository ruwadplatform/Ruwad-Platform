import { MigrationInterface, QueryRunner } from "typeorm";

/** Advisory Services (Discover → Advisory Services): advisors, their services and availability, and consultation bookings with an audit trail.
 * New tables and enum types only; nothing existing changes.
 *
 * Needs the `btree_gist` extension for the exclusion constraint that stops one advisor being double-booked. NOT yet approved for production:
 * this migration has only been run against the local development database. Applying it to Supabase needs a separate, explicit go-ahead
 * (btree_gist is a standard Supabase-supported extension, enabled with CREATE EXTENSION).
 *
 * The constraint refuses an overlapping slot-holding booking (PENDING, CONFIRMED, RESCHEDULE_PROPOSED) for the same advisor, EXCEPT between rows
 * of the same "groupId": a reschedule proposal shares its original's groupId, so it may overlap the original it would replace while both are held. */
export class CreateAdvisoryServices1794300000000 implements MigrationInterface {
    name = "CreateAdvisoryServices1794300000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

        await queryRunner.query(`CREATE TYPE "public"."advisory_advisors_status_enum" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "advisory_advisors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid, "slug" character varying(80) NOT NULL, "name" character varying(120) NOT NULL, "institution" character varying(160) NOT NULL, "institutionFull" character varying(200) NOT NULL, "designation" character varying(120) NOT NULL, "location" character varying(120) NOT NULL, "specialization" character varying(120) NOT NULL, "specializations" text array NOT NULL DEFAULT '{}', "researchAreas" text array NOT NULL DEFAULT '{}', "expertise" character varying(300) NOT NULL, "expertiseTags" text array NOT NULL DEFAULT '{}', "about" text NOT NULL, "yearsExperience" integer, "affiliationVerified" boolean NOT NULL DEFAULT false, "isDemo" boolean NOT NULL DEFAULT false, "status" "public"."advisory_advisors_status_enum" NOT NULL DEFAULT 'PENDING_REVIEW', "reviewedByUserId" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewNotes" text, CONSTRAINT "PK_advisory_advisors_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_advisors_user" ON "advisory_advisors" ("userId") WHERE "userId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_advisors_slug" ON "advisory_advisors" ("slug")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_advisors_status" ON "advisory_advisors" ("status")`);

        await queryRunner.query(`CREATE TYPE "public"."advisory_services_typeid_enum" AS ENUM('specialist', 'review', 'advisory')`);
        await queryRunner.query(`CREATE TABLE "advisory_services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "advisorId" uuid NOT NULL, "typeId" "public"."advisory_services_typeid_enum" NOT NULL, "name" character varying(120) NOT NULL, "description" character varying(400) NOT NULL, "minutes" integer NOT NULL, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_advisory_services_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_services_minutes" CHECK ("minutes" BETWEEN 15 AND 240))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_services_advisor" ON "advisory_services" ("advisorId")`);

        await queryRunner.query(`CREATE TABLE "advisory_availability_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "advisorId" uuid NOT NULL, "weekday" smallint NOT NULL, "startTime" character varying(5) NOT NULL, "endTime" character varying(5) NOT NULL, CONSTRAINT "PK_advisory_availability_rules_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_rules_weekday" CHECK ("weekday" BETWEEN 0 AND 6), CONSTRAINT "CHK_advisory_rules_times" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" > "startTime"))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_rules_advisor" ON "advisory_availability_rules" ("advisorId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_rules_window" ON "advisory_availability_rules" ("advisorId", "weekday", "startTime")`);

        await queryRunner.query(`CREATE TABLE "advisory_availability_exceptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "advisorId" uuid NOT NULL, "date" date NOT NULL, "startTime" character varying(5), "endTime" character varying(5), "reason" character varying(200), CONSTRAINT "PK_advisory_availability_exceptions_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_exceptions_times" CHECK (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "endTime" > "startTime")))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_exceptions_advisor" ON "advisory_availability_exceptions" ("advisorId", "date")`);

        await queryRunner.query(`CREATE TYPE "public"."advisory_bookings_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'RESCHEDULED', 'RESCHEDULE_PROPOSED')`);
        await queryRunner.query(`CREATE TABLE "advisory_bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reference" character varying(16) NOT NULL, "groupId" uuid NOT NULL, "advisorId" uuid NOT NULL, "serviceId" uuid NOT NULL, "startupId" uuid NOT NULL, "requestedByUserId" uuid NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "minutes" integer NOT NULL, "serviceName" character varying(120) NOT NULL, "serviceTypeId" character varying(20) NOT NULL, "startupName" character varying(200) NOT NULL, "description" text, "status" "public"."advisory_bookings_status_enum" NOT NULL DEFAULT 'PENDING', "rescheduledFromId" uuid, "proposedBy" character varying(10), "decisionNote" text, "decidedAt" TIMESTAMP WITH TIME ZONE, "cancelledBy" character varying(10), "cancelReason" text, "cancelledAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "isDemo" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_advisory_bookings_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_bookings_range" CHECK ("endsAt" > "startsAt"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_bookings_reference" ON "advisory_bookings" ("reference")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_advisor" ON "advisory_bookings" ("advisorId", "startsAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_startup" ON "advisory_bookings" ("startupId")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_requester" ON "advisory_bookings" ("requestedByUserId")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_status" ON "advisory_bookings" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_bookings_demo" ON "advisory_bookings" ("isDemo")`);
        // One open reschedule proposal per booking.
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_bookings_one_proposal" ON "advisory_bookings" ("rescheduledFromId") WHERE "status" = 'RESCHEDULE_PROPOSED'`);
        // Double-booking protection, enforced by the database itself.
        await queryRunner.query(`ALTER TABLE "advisory_bookings" ADD CONSTRAINT "EX_advisory_bookings_no_overlap" EXCLUDE USING gist ("advisorId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&, "groupId" WITH <>) WHERE ("status" IN ('PENDING', 'CONFIRMED', 'RESCHEDULE_PROPOSED'))`);

        await queryRunner.query(`CREATE TABLE "advisory_booking_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bookingId" uuid NOT NULL, "actorUserId" uuid, "actorRole" character varying(10) NOT NULL, "type" character varying(30) NOT NULL, "fromStatus" character varying(24), "toStatus" character varying(24), "details" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_advisory_booking_events_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_booking_events_booking" ON "advisory_booking_events" ("bookingId", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_booking_events_booking"`);
        await queryRunner.query(`DROP TABLE "advisory_booking_events"`);
        await queryRunner.query(`ALTER TABLE "advisory_bookings" DROP CONSTRAINT "EX_advisory_bookings_no_overlap"`);
        await queryRunner.query(`DROP TABLE "advisory_bookings"`);
        await queryRunner.query(`DROP TYPE "public"."advisory_bookings_status_enum"`);
        await queryRunner.query(`DROP TABLE "advisory_availability_exceptions"`);
        await queryRunner.query(`DROP TABLE "advisory_availability_rules"`);
        await queryRunner.query(`DROP TABLE "advisory_services"`);
        await queryRunner.query(`DROP TYPE "public"."advisory_services_typeid_enum"`);
        await queryRunner.query(`DROP TABLE "advisory_advisors"`);
        await queryRunner.query(`DROP TYPE "public"."advisory_advisors_status_enum"`);
        // btree_gist is left installed: other objects may come to depend on it, and removing an extension is not this migration's call.
    }
}
