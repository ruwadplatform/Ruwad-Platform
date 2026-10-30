import { MigrationInterface, QueryRunner } from "typeorm";

/** Email verification (6-digit code).
 *
 *  - users.emailVerifiedAt / emailVerifiedVia: when and how an address was proven. NULL = not verified.
 *  - BACKFILL: every account that exists when this runs is marked verified with source 'LEGACY' (grandfathered), so switching enforcement on
 *    can never lock out an existing member or administrator. Accounts created afterwards start unverified when EMAIL_VERIFICATION_REQUIRED is on.
 *  - email_verification_codes: one row per code issued. Only a keyed hash of the code is stored (never the code), with expiry, attempt count and
 *    consumed / superseded markers. Rows are deleted with their account.
 *  - email_verification_audit: who marked an address verified by hand (the guarded recovery script) and why. No foreign key on purpose: the
 *    record must survive the account.
 *
 *  Additive and fast: ADD COLUMN without a default is a metadata change in PostgreSQL, and the only write to existing rows sets the two new columns.
 *  Reverting drops the table, the audit table and the two columns. */
export class AddEmailVerification1794700000000 implements MigrationInterface {
    name = "AddEmailVerification1794700000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "emailVerifiedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "emailVerifiedVia" character varying(16)`);
        await queryRunner.query(`UPDATE "users" SET "emailVerifiedAt" = now(), "emailVerifiedVia" = 'LEGACY' WHERE "emailVerifiedAt" IS NULL`);

        await queryRunner.query(`CREATE TABLE "email_verification_codes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "codeHash" character varying(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" smallint NOT NULL DEFAULT 0, "maxAttempts" smallint NOT NULL DEFAULT 5, "consumedAt" TIMESTAMP WITH TIME ZONE, "supersededAt" TIMESTAMP WITH TIME ZONE, "ipHash" character varying(64), "deliveryResult" character varying(8), CONSTRAINT "PK_email_verification_codes" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verification_codes_user_created" ON "email_verification_codes" ("userId", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verification_codes_expires" ON "email_verification_codes" ("expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verification_codes_ip_created" ON "email_verification_codes" ("ipHash", "createdAt") WHERE "ipHash" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "email_verification_codes" ADD CONSTRAINT "FK_email_verification_codes_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        await queryRunner.query(`CREATE TABLE "email_verification_audit" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "action" character varying(24) NOT NULL, "actor" character varying(120) NOT NULL, "reason" text NOT NULL, CONSTRAINT "PK_email_verification_audit" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verification_audit_user" ON "email_verification_audit" ("userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_email_verification_audit_user"`);
        await queryRunner.query(`DROP TABLE "email_verification_audit"`);
        await queryRunner.query(`ALTER TABLE "email_verification_codes" DROP CONSTRAINT "FK_email_verification_codes_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_verification_codes_ip_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_verification_codes_expires"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_verification_codes_user_created"`);
        await queryRunner.query(`DROP TABLE "email_verification_codes"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerifiedVia"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerifiedAt"`);
    }
}
