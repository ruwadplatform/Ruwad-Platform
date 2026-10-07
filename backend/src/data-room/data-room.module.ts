import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataRoomAccess } from "./data-room-access.entity";
import { DataRoomFile } from "./data-room-file.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { DataRoomService } from "./data-room.service";
import { DataRoomController } from "./data-room.controller";
import { DataRoomFilesService } from "./data-room-files.service";
import { DataRoomFilesController } from "./data-room-files.controller";
import { UsersModule } from "../users/users.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [TypeOrmModule.forFeature([DataRoomAccess, DataRoomFile, DocumentRef]), UsersModule, OrganizationsModule, EmailModule],
  providers: [DataRoomService, DataRoomFilesService],
  controllers: [DataRoomController, DataRoomFilesController],
  exports: [DataRoomService],
})
export class DataRoomModule {}
