import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrganizationDetailsAndInterests1789459829097 implements MigrationInterface {
    name = 'AddOrganizationDetailsAndInterests1789459829097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "organizationWebsite" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "organizationStage" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "organizationCategory" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "organizationCity" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "organizationType" character varying`);
        await queryRunner.query(`ALTER TABLE "users" ADD "interests" text array NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "interests"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationType"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationCity"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationCategory"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationStage"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "organizationWebsite"`);
    }

}
