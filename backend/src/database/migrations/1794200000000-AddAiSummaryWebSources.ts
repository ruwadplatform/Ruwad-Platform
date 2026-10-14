import { MigrationInterface, QueryRunner } from "typeorm";

/** ai_summaries.webSources: the public web results a summary cites. Additive column with an empty default; existing rows are unaffected. */
export class AddAiSummaryWebSources1794200000000 implements MigrationInterface {
    name = "AddAiSummaryWebSources1794200000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_summaries" ADD "webSources" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ai_summaries" DROP COLUMN "webSources"`);
    }
}
