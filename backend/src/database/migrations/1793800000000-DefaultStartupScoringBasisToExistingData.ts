import { MigrationInterface, QueryRunner } from "typeorm";

/** A startup row created by any path that does not name a scoring basis (a seed script, an import, a future code path) is scored on the
 * information provided, like every submitted startup. Only the column default changes; existing rows are untouched. */
export class DefaultStartupScoringBasisToExistingData1793800000000 implements MigrationInterface {
    name = "DefaultStartupScoringBasisToExistingData1793800000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startups" ALTER COLUMN "scoringBasis" SET DEFAULT 'EXISTING_DATA'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "startups" ALTER COLUMN "scoringBasis" SET DEFAULT 'STANDARD'`);
    }
}
