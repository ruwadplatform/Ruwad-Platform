import { MigrationInterface, QueryRunner } from "typeorm";

/** User-submitted reports: a private submission workflow (submissions, PDFs, hashed single-use review tokens) plus a few
 * additive columns on `reports` so an approved submission is just another report. Nothing existing is altered or removed. */
export class AddUserReportSubmissions1790300000000 implements MigrationInterface {
    name = 'AddUserReportSubmissions1790300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "report_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" uuid NOT NULL, "title" character varying NOT NULL, "reportType" character varying NOT NULL, "sector" character varying NOT NULL, "geography" character varying NOT NULL, "publicationDate" date, "description" text NOT NULL, "executiveSummary" text NOT NULL, "authorName" character varying NOT NULL, "organizationName" character varying NOT NULL, "authorEmail" character varying NOT NULL, "website" character varying, "linkedin" character varying, "reportUrl" character varying, "fileId" uuid, "sources" jsonb NOT NULL DEFAULT '[]', "declarationAccepted" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'PENDING_REVIEW', "idempotencyKey" character varying NOT NULL, "submittedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "reviewedAt" TIMESTAMP WITH TIME ZONE, "reviewAction" character varying, "reviewedByUserId" uuid, "reviewedVia" character varying, "rejectionReason" text, "rejectedAt" TIMESTAMP WITH TIME ZONE, "publishedAt" TIMESTAMP WITH TIME ZONE, "publishedReportId" uuid, "reviewEmailSentAt" TIMESTAMP WITH TIME ZONE, "reviewEmailAttempts" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_report_submissions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_report_submissions_userId" ON "report_submissions" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_report_submissions_status" ON "report_submissions" ("status")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_report_submissions_user_idem" ON "report_submissions" ("userId", "idempotencyKey")`);

        await queryRunner.query(`CREATE TABLE "report_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "ownerUserId" uuid NOT NULL, "fileName" character varying NOT NULL, "mimeType" character varying NOT NULL DEFAULT 'application/pdf', "size" integer NOT NULL, "sha256" character varying NOT NULL, "data" bytea NOT NULL, CONSTRAINT "PK_report_files" PRIMARY KEY ("id"))`);

        await queryRunner.query(`CREATE TABLE "report_review_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submissionId" uuid NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_report_review_tokens" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_report_review_tokens_submissionId" ON "report_review_tokens" ("submissionId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_report_review_tokens_hash" ON "report_review_tokens" ("tokenHash")`);

        await queryRunner.query(`ALTER TABLE "reports" ADD "origin" character varying NOT NULL DEFAULT 'RUWAD'`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "submissionId" uuid`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "organizationName" character varying`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "reportDate" date`);

        await queryRunner.query(`ALTER TABLE "reports" ADD "reportUrl" character varying`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "reportFileId" uuid`);
        await queryRunner.query(`ALTER TABLE "reports" ADD "referenceLinks" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const c of ["referenceLinks", "reportFileId", "reportUrl", "reportDate", "organizationName", "submissionId", "origin"]) {
            await queryRunner.query(`ALTER TABLE "reports" DROP COLUMN "${c}"`);
        }
        await queryRunner.query(`DROP TABLE "report_review_tokens"`);
        await queryRunner.query(`DROP TABLE "report_files"`);
        await queryRunner.query(`DROP TABLE "report_submissions"`);
    }
}
