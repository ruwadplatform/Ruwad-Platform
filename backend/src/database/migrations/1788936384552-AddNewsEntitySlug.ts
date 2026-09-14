import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNewsEntitySlug1788936384552 implements MigrationInterface {
    name = 'AddNewsEntitySlug1788936384552'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_related_entities" ADD "entitySlug" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_related_entities" DROP COLUMN "entitySlug"`);
    }

}
