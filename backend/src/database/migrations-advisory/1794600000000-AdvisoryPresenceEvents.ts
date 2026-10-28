import { MigrationInterface, QueryRunner } from "typeorm";

/** OPT-IN MIGRATION (lives in migrations-advisory/, only listed when ADVISORY_MIGRATIONS=true; see src/database/migration-sources.ts).
 * The ledger of Daily's join and leave events, so connected time can be told from disconnected gaps. Additive only: one new table. Nothing existing is
 * touched. Meant to be applied together with the three earlier advisory migrations in one controlled window (none has reached production).
 *
 * Why a ledger: Daily's events carry the first join's time and a duration that keeps growing, so one stored span per session counted every disconnection
 * as attendance (a live test: 467 s recorded for 279 s connected). Each event is stored once, by its own time, and the connected stretches are derived
 * from the set of events: the result does not depend on the order they arrived, and a repeated event changes nothing (the unique index). The stretches are
 * written to advisory_meeting_attendance, which the summary and the Needs Review logic already read. */
export class AdvisoryPresenceEvents1794600000000 implements MigrationInterface {
    name = "AdvisoryPresenceEvents1794600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "advisory_presence_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "bookingId" uuid NOT NULL, "userId" uuid NOT NULL, "role" character varying(10) NOT NULL, "sessionKey" character varying(80) NOT NULL, "kind" character varying(6) NOT NULL, "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL, "stayStartedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_advisory_presence_events" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_presence_events_kind" CHECK ("kind" IN ('joined', 'left')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_presence_events_event" ON "advisory_presence_events" ("bookingId", "userId", "sessionKey", "kind", "occurredAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_presence_events_booking" ON "advisory_presence_events" ("bookingId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_presence_events_booking"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_presence_events_event"`);
        await queryRunner.query(`DROP TABLE "advisory_presence_events"`);
    }
}
