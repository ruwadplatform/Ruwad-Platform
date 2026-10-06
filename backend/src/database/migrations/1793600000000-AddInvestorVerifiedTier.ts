import { MigrationInterface, QueryRunner } from "typeorm";

/** investors.verified: the same unclaimed / self-reported / verified tier a startup has, so an owner can claim an investor listing.
 * Every existing listing starts "unclaimed", except one that already has an owner, which is "self-reported". Additive. */
export class AddInvestorVerifiedTier1793600000000 implements MigrationInterface {
    name = "AddInvestorVerifiedTier1793600000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "investors" ADD "verified" character varying NOT NULL DEFAULT 'unclaimed'`);
        await queryRunner.query(`UPDATE "investors" SET "verified" = 'self-reported' WHERE "id" IN (SELECT "entityId" FROM "entity_memberships" WHERE "kind" = 'INVESTOR' AND "role" = 'OWNER')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "investors" DROP COLUMN "verified"`);
    }
}
