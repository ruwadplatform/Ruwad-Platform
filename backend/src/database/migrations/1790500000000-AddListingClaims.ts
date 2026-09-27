import { MigrationInterface, QueryRunner } from "typeorm";

/** Real, persisted "claim this listing" requests — replaces the old browser-localStorage-only mock (never wired to the
 * backend). Approving a claim is handled in code (creates an `entity_memberships` OWNER row); this table only ever
 * tracks the request and its review. Purely additive: no existing table is touched. */
export class AddListingClaims1790500000000 implements MigrationInterface {
    name = 'AddListingClaims1790500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."listing_claims_kind_enum" AS ENUM('STARTUP', 'INVESTOR', 'HUB', 'RESEARCH', 'MULTINATIONAL')`);
        await queryRunner.query(`CREATE TABLE "listing_claims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "kind" "public"."listing_claims_kind_enum" NOT NULL, "entityId" uuid NOT NULL, "role" character varying NOT NULL, "note" text NOT NULL DEFAULT '', "status" character varying NOT NULL DEFAULT 'PENDING', "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewedByUserId" uuid, "rejectionReason" text, CONSTRAINT "PK_listing_claims" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_listing_claims_userId" ON "listing_claims" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_listing_claims_entityId" ON "listing_claims" ("entityId")`);
        await queryRunner.query(`CREATE INDEX "IDX_listing_claims_status" ON "listing_claims" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_listing_claims_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_listing_claims_entityId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_listing_claims_userId"`);
        await queryRunner.query(`DROP TABLE "listing_claims"`);
        await queryRunner.query(`DROP TYPE "public"."listing_claims_kind_enum"`);
    }
}
