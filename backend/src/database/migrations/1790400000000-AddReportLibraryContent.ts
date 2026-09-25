import { MigrationInterface, QueryRunner } from "typeorm";

/** Default RUWĀD report library: one additive, nullable column holding a report's sourced content (facts with their quotes,
 * live World Bank points, sections). Existing reports are untouched and keep a NULL value. */
export class AddReportLibraryContent1790400000000 implements MigrationInterface {
    name = 'AddReportLibraryContent1790400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" ADD "libraryContent" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "libraryContent"`);
    }
}
