import { MigrationInterface, QueryRunner } from "typeorm";

/** OPT-IN MIGRATION (lives in migrations-advisory/, only listed when ADVISORY_MIGRATIONS=true; see src/database/migration-sources.ts).
 * "Become an Advisor": the application form, its supporting documents and the decision history. Additive only: new nullable columns on
 * advisory_advisors and two new tables. Nothing outside the advisory tables is touched. Local-only so far; production needs a separate, explicit
 * go-ahead and is meant to be applied together with the two earlier advisory migrations in one controlled window.
 *
 * - An application IS the advisor profile in PENDING_REVIEW (no second record to keep in step); the new columns hold what the form asks for.
 * - advisory_application_documents: the CV, certificates and photograph, stored privately in the database (bytea) exactly like Data Room files.
 *   They are never served from a public URL; only an administrator (or the applicant, for their own list of names) can reach them.
 * - advisory_application_events: append-only history (submitted / approved / rejected / suspended / notification), including the rejection reason. */
export class AdvisorApplications1794500000000 implements MigrationInterface {
    name = "AdvisorApplications1794500000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "advisory_advisors"
            ADD COLUMN "contactEmail" character varying(254),
            ADD COLUMN "phone" character varying(40),
            ADD COLUMN "consultationServices" text,
            ADD COLUMN "preferredMinutes" integer,
            ADD COLUMN "linkedinUrl" character varying(300),
            ADD COLUMN "websiteUrl" character varying(300),
            ADD COLUMN "applicationReference" character varying(24),
            ADD COLUMN "submittedAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN "declarationAcceptedAt" TIMESTAMP WITH TIME ZONE,
            ADD CONSTRAINT "CHK_advisory_advisors_preferred_minutes" CHECK ("preferredMinutes" IS NULL OR "preferredMinutes" IN (30, 45, 60))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_advisory_advisors_reference" ON "advisory_advisors" ("applicationReference") WHERE "applicationReference" IS NOT NULL`);

        await queryRunner.query(`CREATE TABLE "advisory_application_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "advisorId" uuid NOT NULL, "kind" character varying(12) NOT NULL, "fileName" character varying(150) NOT NULL, "mimeType" character varying(80) NOT NULL, "size" integer NOT NULL, "data" bytea NOT NULL, CONSTRAINT "PK_advisory_application_documents_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_advisory_application_documents_kind" CHECK ("kind" IN ('CV', 'CERTIFICATE', 'PHOTO')))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_application_documents_advisor" ON "advisory_application_documents" ("advisorId")`);

        await queryRunner.query(`CREATE TABLE "advisory_application_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "advisorId" uuid NOT NULL, "actorUserId" uuid, "actorRole" character varying(10) NOT NULL, "type" character varying(16) NOT NULL, "fromStatus" character varying(20), "toStatus" character varying(20), "note" text, "details" jsonb, CONSTRAINT "PK_advisory_application_events_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_advisory_application_events_advisor" ON "advisory_application_events" ("advisorId", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_application_events_advisor"`);
        await queryRunner.query(`DROP TABLE "advisory_application_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_application_documents_advisor"`);
        await queryRunner.query(`DROP TABLE "advisory_application_documents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_advisory_advisors_reference"`);
        await queryRunner.query(`ALTER TABLE "advisory_advisors"
            DROP CONSTRAINT "CHK_advisory_advisors_preferred_minutes",
            DROP COLUMN "declarationAcceptedAt",
            DROP COLUMN "submittedAt",
            DROP COLUMN "applicationReference",
            DROP COLUMN "websiteUrl",
            DROP COLUMN "linkedinUrl",
            DROP COLUMN "preferredMinutes",
            DROP COLUMN "consultationServices",
            DROP COLUMN "phone",
            DROP COLUMN "contactEmail"`);
    }
}
