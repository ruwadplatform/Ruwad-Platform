import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNewsEventsIngestion1789900000000 implements MigrationInterface {
    name = 'AddNewsEventsIngestion1789900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "imageUrl" text`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "urlKey" character varying`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "titleKey" character varying`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "isPublished" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "isFeatured" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "origin" character varying NOT NULL DEFAULT 'manual'`);
        await queryRunner.query(`ALTER TABLE "news_articles" ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_news_articles_urlKey" ON "news_articles" ("urlKey") WHERE "urlKey" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_news_articles_publishedDate" ON "news_articles" ("publishedDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_news_articles_titleKey" ON "news_articles" ("titleKey") `);

        await queryRunner.query(`ALTER TABLE "events" ADD "startDate" date`);
        await queryRunner.query(`ALTER TABLE "events" ADD "endDate" date`);
        await queryRunner.query(`ALTER TABLE "events" ADD "city" character varying`);
        await queryRunner.query(`ALTER TABLE "events" ADD "venue" character varying`);
        await queryRunner.query(`ALTER TABLE "events" ADD "registrationUrl" text`);
        await queryRunner.query(`ALTER TABLE "events" ADD "imageUrl" text`);
        await queryRunner.query(`ALTER TABLE "events" ADD "urlKey" character varying`);
        await queryRunner.query(`ALTER TABLE "events" ADD "nameKey" character varying`);
        await queryRunner.query(`ALTER TABLE "events" ADD "isPublished" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "events" ADD "isFeatured" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "events" ADD "origin" character varying NOT NULL DEFAULT 'manual'`);
        await queryRunner.query(`ALTER TABLE "events" ADD "dateSource" character varying`);
        await queryRunner.query(`ALTER TABLE "events" ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`UPDATE "events" SET "startDate" = "date", "endDate" = "date" WHERE "startDate" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_events_urlKey" ON "events" ("urlKey") WHERE "urlKey" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_events_endDate" ON "events" ("endDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_events_nameKey" ON "events" ("nameKey") `);

        await queryRunner.query(`CREATE TABLE "content_sync_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "kind" character varying NOT NULL, "status" character varying NOT NULL, "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "finishedAt" TIMESTAMP WITH TIME ZONE, "fetched" integer NOT NULL DEFAULT '0', "saved" integer NOT NULL DEFAULT '0', "updated" integer NOT NULL DEFAULT '0', "skipped" integer NOT NULL DEFAULT '0', "message" text, CONSTRAINT "PK_content_sync_runs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_content_sync_runs_kind" ON "content_sync_runs" ("kind") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "content_sync_runs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_events_nameKey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_events_endDate"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_events_urlKey"`);
        for (const c of ["lastSeenAt", "dateSource", "origin", "isFeatured", "isPublished", "nameKey", "urlKey", "imageUrl", "registrationUrl", "venue", "city", "endDate", "startDate"]) {
            await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "${c}"`);
        }
        await queryRunner.query(`DROP INDEX "public"."IDX_news_articles_titleKey"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_news_articles_publishedDate"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_news_articles_urlKey"`);
        for (const c of ["lastSeenAt", "origin", "isFeatured", "isPublished", "titleKey", "urlKey", "imageUrl"]) {
            await queryRunner.query(`ALTER TABLE "news_articles" DROP COLUMN "${c}"`);
        }
    }
}
