import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileExtras1788901451414 implements MigrationInterface {
    name = 'AddProfileExtras1788901451414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startups" ADD "traction" jsonb`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "newsItems" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "coreResearchAreas" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "researchCenters" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "facilities" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "clinical" jsonb`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "innovation" jsonb`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "contacts" jsonb`);
        await queryRunner.query(`ALTER TABLE "multinationals" ADD "startupProgramsList" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "multinationals" ADD "investmentsList" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "multinationals" ADD "newsItems" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "investors" ADD "openOpps" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "investors" ADD "recentDeals" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "investors" ADD "news" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "hubs" ADD "focusAreas" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "hubs" ADD "eligibility" jsonb`);
        await queryRunner.query(`ALTER TABLE "hubs" ADD "application" jsonb`);
        await queryRunner.query(`ALTER TABLE "hub_portfolio_items" ADD "location" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hub_portfolio_items" DROP COLUMN "location"`);
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "application"`);
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "eligibility"`);
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "focusAreas"`);
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "news"`);
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "recentDeals"`);
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "openOpps"`);
        await queryRunner.query(`ALTER TABLE "multinationals" DROP COLUMN "newsItems"`);
        await queryRunner.query(`ALTER TABLE "multinationals" DROP COLUMN "investmentsList"`);
        await queryRunner.query(`ALTER TABLE "multinationals" DROP COLUMN "startupProgramsList"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "contacts"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "innovation"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "clinical"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "facilities"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "researchCenters"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "coreResearchAreas"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "newsItems"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "traction"`);
    }

}
