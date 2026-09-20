import { MigrationInterface, QueryRunner } from "typeorm";

/** Google Calendar integration: one encrypted OAuth connection per user, and a
 * (user, event) link row per explicitly added event. Additive only. */
export class AddGoogleCalendar1790000000000 implements MigrationInterface {
    name = 'AddGoogleCalendar1790000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "google_calendar_connections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "googleEmail" character varying NOT NULL, "refreshTokenEnc" text NOT NULL, "accessTokenEnc" text, "accessTokenExpiresAt" TIMESTAMP WITH TIME ZONE, "scope" text NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "connectedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastUsedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_20a15ff58f76fbfa3e626c852b5" UNIQUE ("userId"), CONSTRAINT "PK_google_calendar_connections" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "FK_google_calendar_connections_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        await queryRunner.query(`CREATE TABLE "calendar_event_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "eventId" uuid NOT NULL, "googleEventId" character varying NOT NULL, "htmlLink" text, CONSTRAINT "PK_calendar_event_links" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_calendar_event_links_user_event" ON "calendar_event_links" ("userId", "eventId") `);
        await queryRunner.query(`ALTER TABLE "calendar_event_links" ADD CONSTRAINT "FK_calendar_event_links_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "calendar_event_links" ADD CONSTRAINT "FK_calendar_event_links_event" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "calendar_event_links" DROP CONSTRAINT "FK_calendar_event_links_event"`);
        await queryRunner.query(`ALTER TABLE "calendar_event_links" DROP CONSTRAINT "FK_calendar_event_links_user"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_calendar_event_links_user_event"`);
        await queryRunner.query(`DROP TABLE "calendar_event_links"`);
        await queryRunner.query(`ALTER TABLE "google_calendar_connections" DROP CONSTRAINT "FK_google_calendar_connections_user"`);
        await queryRunner.query(`DROP TABLE "google_calendar_connections"`);
    }
}
