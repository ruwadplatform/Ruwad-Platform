import { MigrationInterface, QueryRunner } from "typeorm";

/** investors.website: the firm's own website, shown on its profile. Nullable and additive. */
export class AddInvestorWebsite1793700000000 implements MigrationInterface {
    name = "AddInvestorWebsite1793700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "investors" ADD "website" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "website"`);
    }
}
