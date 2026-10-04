import { MigrationInterface, QueryRunner } from "typeorm";

/** Adds optional, founder-reported experience fields to team_members —
 * feeds the Team Strength scoring factor via
 * scoring/feature-derivation.service.ts, which aggregates the strongest
 * (max) value across a startup's founder rows rather than asking for a
 * single flat number on the company itself. Purely additive, all nullable —
 * every existing row is unaffected. */
export class AddTeamMemberScoringFields1790700000000 implements MigrationInterface {
    name = 'AddTeamMemberScoringFields1790700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_members" ADD "experienceYears" integer`);
        await queryRunner.query(`ALTER TABLE "team_members" ADD "healthcareExperienceYears" integer`);
        await queryRunner.query(`ALTER TABLE "team_members" ADD "previousStartupExperience" boolean`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "previousStartupExperience"`);
        await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "healthcareExperienceYears"`);
        await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "experienceYears"`);
    }
}
