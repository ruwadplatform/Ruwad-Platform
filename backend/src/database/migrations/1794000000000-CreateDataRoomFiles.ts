import { MigrationInterface, QueryRunner } from "typeorm";

/** data_room_files: the documents an owner uploads to their Data Room, stored as bytea. New table only; nothing existing changes. */
export class CreateDataRoomFiles1794000000000 implements MigrationInterface {
    name = "CreateDataRoomFiles1794000000000"

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."data_room_files_entitytype_enum" AS ENUM('STARTUP', 'INVESTOR', 'HUB', 'RESEARCH', 'MULTINATIONAL')`);
        await queryRunner.query(`CREATE TABLE "data_room_files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "entityType" "public"."data_room_files_entitytype_enum" NOT NULL, "entityId" uuid NOT NULL, "name" character varying NOT NULL, "category" character varying NOT NULL, "fileName" character varying NOT NULL, "mimeType" character varying NOT NULL, "size" integer NOT NULL, "data" bytea NOT NULL, "uploadedByUserId" uuid NOT NULL, CONSTRAINT "PK_data_room_files_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_data_room_files_entity" ON "data_room_files" ("entityType", "entityId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_data_room_files_entity"`);
        await queryRunner.query(`DROP TABLE "data_room_files"`);
        await queryRunner.query(`DROP TYPE "public"."data_room_files_entitytype_enum"`);
    }
}
