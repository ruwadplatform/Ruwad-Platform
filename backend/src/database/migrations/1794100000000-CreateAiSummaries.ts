import { MigrationInterface, QueryRunner } from "typeorm";

/** ai_summaries: cached AI-written organization summaries (directory "AI Summary" panel). New table only; nothing existing changes. */
export class CreateAiSummaries1794100000000 implements MigrationInterface {
    name = "CreateAiSummaries1794100000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."ai_summaries_entitytype_enum" AS ENUM('STARTUP', 'INVESTOR', 'HUB', 'RESEARCH', 'MULTINATIONAL')`);
        await queryRunner.query(`CREATE TABLE "ai_summaries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "entityType" "public"."ai_summaries_entitytype_enum" NOT NULL, "entityId" uuid NOT NULL, "accessScope" character varying NOT NULL DEFAULT 'member', "overview" text NOT NULL, "highlights" jsonb NOT NULL DEFAULT '[]', "modelVersion" character varying NOT NULL, "promptVersion" character varying NOT NULL, "sourceFingerprint" character varying NOT NULL, "generatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" character varying NOT NULL DEFAULT 'READY', CONSTRAINT "PK_ai_summaries_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_ai_summaries_entity_scope" ON "ai_summaries" ("entityType", "entityId", "accessScope")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_ai_summaries_entity_scope"`);
        await queryRunner.query(`DROP TABLE "ai_summaries"`);
        await queryRunner.query(`DROP TYPE "public"."ai_summaries_entitytype_enum"`);
    }
}
