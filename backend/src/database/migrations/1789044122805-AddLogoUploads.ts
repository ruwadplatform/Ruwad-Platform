import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLogoUploads1789044122805 implements MigrationInterface {
    name = 'AddLogoUploads1789044122805'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "uploaded_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "mimeType" character varying NOT NULL, "data" bytea NOT NULL, "size" integer NOT NULL, "uploadedByUserId" uuid NOT NULL, CONSTRAINT "PK_37f0f1866d702a0ac47830c2858" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "startups" ADD "logoImageId" uuid`);
        await queryRunner.query(`ALTER TABLE "research_institutions" ADD "logoImageId" uuid`);
        await queryRunner.query(`ALTER TABLE "multinationals" ADD "logoImageId" uuid`);
        await queryRunner.query(`ALTER TABLE "investors" ADD "logoImageId" uuid`);
        await queryRunner.query(`ALTER TABLE "hubs" ADD "logoImageId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "logoImageId"`);
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "logoImageId"`);
        await queryRunner.query(`ALTER TABLE "multinationals" DROP COLUMN "logoImageId"`);
        await queryRunner.query(`ALTER TABLE "research_institutions" DROP COLUMN "logoImageId"`);
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "logoImageId"`);
        await queryRunner.query(`DROP TABLE "uploaded_images"`);
    }

}
