import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserProfileImage1789700000000 implements MigrationInterface {
    name = 'AddUserProfileImage1789700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "profileImageId" uuid`);
        await queryRunner.query(`ALTER TABLE "uploaded_images" ADD "purpose" character varying NOT NULL DEFAULT 'LOGO'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "uploaded_images" DROP COLUMN "purpose"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "profileImageId"`);
    }
}
