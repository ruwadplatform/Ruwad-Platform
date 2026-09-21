import { MigrationInterface, QueryRunner } from "typeorm";

/** Generated reports (RUWĀD statistics + saved external sources) and the shared research cache. Additive only:
 * existing reports keep working — they default to published with no generated content. */
export class AddReportGenerationAndResearchCache1790100000000 implements MigrationInterface {
    name = 'AddReportGenerationAndResearchCache1790100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "research_cache" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "key" character varying NOT NULL, "kind" character varying NOT NULL, "query" text NOT NULL, "payload" jsonb NOT NULL, "fetchedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_research_cache" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_research_cache_key" ON "research_cache" ("key") `);

        await queryRunner.query(`ALTER TABLE "reports" ADD "isPublished" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "reportKind" character varying`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "scope" jsonb`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "internalStats" jsonb`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "externalSources" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "researchQueries" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "researchedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "generationMode" character varying`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "generated" jsonb`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "aiOverview" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const c of ["aiOverview", "generated", "generationMode", "researchedAt", "researchQueries", "externalSources", "internalStats", "scope", "reportKind", "isPublished"]) {
            await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "${c}"`);
        }
        await queryRunner.query(`DROP INDEX "public"."IDX_research_cache_key"`);
        await queryRunner.query(`DROP TABLE "research_cache"`);
    }
}
