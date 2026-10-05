import { MigrationInterface, QueryRunner } from "typeorm";

/** startups.scoringBasis: which scoring rule applies. STANDARD (default; the full rule, every existing and future founder submission) or
 * EXISTING_DATA (directory startups scored on what is on file, a factor with no data counted as 0). Additive; every current row gets STANDARD. */
export class AddStartupScoringBasis1793500000000 implements MigrationInterface {
    name = "AddStartupScoringBasis1793500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startups" ADD "scoringBasis" character varying NOT NULL DEFAULT 'STANDARD'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startups" DROP COLUMN "scoringBasis"`);
    }
}
