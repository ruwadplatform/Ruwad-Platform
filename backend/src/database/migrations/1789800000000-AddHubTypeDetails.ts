import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHubTypeDetails1789800000000 implements MigrationInterface {
    name = 'AddHubTypeDetails1789800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hubs" ADD "hasFunding" boolean`);
        await queryRunner.query(`ALTER TABLE "hubs" ADD "typeDetails" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "typeDetails"`);
        await queryRunner.query(`ALTER TABLE "hubs" DROP COLUMN "hasFunding"`);
    }
}
