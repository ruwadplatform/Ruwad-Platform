import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReportProvenance1788936610626 implements MigrationInterface {
    name = 'AddReportProvenance1788936610626'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" ADD "provenanceConfidence" character varying NOT NULL DEFAULT 'Medium'`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "provenanceLastUpdated" date`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "provenanceSources" text array NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "provenanceSources"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "provenanceLastUpdated"`);
        await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "provenanceConfidence"`);
    }

}
