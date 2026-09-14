import { MigrationInterface, QueryRunner } from "typeorm";

export class AddResearchChildTables1788898449982 implements MigrationInterface {
    name = 'AddResearchChildTables1788898449982'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "research_projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "researchInstitutionId" uuid NOT NULL, "title" character varying NOT NULL, "area" character varying NOT NULL, "status" character varying NOT NULL, "startYear" integer NOT NULL, "partners" text array NOT NULL DEFAULT '{}', CONSTRAINT "PK_271b7747dc3eed89c8204723492" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d2ac0574c4bd6a3d9bbd35ed2d" ON "research_projects" ("researchInstitutionId") `);
        await queryRunner.query(`CREATE TABLE "publications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "researchInstitutionId" uuid NOT NULL, "title" character varying NOT NULL, "area" character varying NOT NULL, "authors" character varying NOT NULL, "journal" character varying NOT NULL, "year" integer NOT NULL, CONSTRAINT "PK_2c4e732b044e09139d2f1065fae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_911ede84f90a0d668623a89ae2" ON "publications" ("researchInstitutionId") `);
        await queryRunner.query(`CREATE TABLE "research_technologies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "researchInstitutionId" uuid NOT NULL, "name" character varying NOT NULL, "area" character varying NOT NULL, "trl" integer NOT NULL, "status" character varying NOT NULL, CONSTRAINT "PK_b345613e0772d786a3ba03c33cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5fc46bcbece70b84275394395a" ON "research_technologies" ("researchInstitutionId") `);
        await queryRunner.query(`CREATE TABLE "researchers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "researchInstitutionId" uuid NOT NULL, "name" character varying NOT NULL, "title" character varying NOT NULL, "area" character varying NOT NULL, CONSTRAINT "PK_7d8f21965244b6a051c4fef4a8d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9df9e6697e07cbb665c9cfb72a" ON "researchers" ("researchInstitutionId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_9df9e6697e07cbb665c9cfb72a"`);
        await queryRunner.query(`DROP TABLE "researchers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5fc46bcbece70b84275394395a"`);
        await queryRunner.query(`DROP TABLE "research_technologies"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_911ede84f90a0d668623a89ae2"`);
        await queryRunner.query(`DROP TABLE "publications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2ac0574c4bd6a3d9bbd35ed2d"`);
        await queryRunner.query(`DROP TABLE "research_projects"`);
    }

}
