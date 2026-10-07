import { MigrationInterface, QueryRunner } from "typeorm";

/** team_members.linkedin: the member's own LinkedIn profile, shown as a link on the profile only when provided. Nullable and additive. */
export class AddTeamMemberLinkedin1793900000000 implements MigrationInterface {
    name = "AddTeamMemberLinkedin1793900000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_members" ADD "linkedin" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "linkedin"`);
    }
}
