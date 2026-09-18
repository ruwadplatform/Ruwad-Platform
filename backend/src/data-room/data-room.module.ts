import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataRoomAccess } from "./data-room-access.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { DataRoomService } from "./data-room.service";
import { DataRoomController } from "./data-room.controller";
import { UsersModule } from "../users/users.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [TypeOrmModule.forFeature([DataRoomAccess, DocumentRef]), UsersModule, OrganizationsModule, EmailModule],
  providers: [DataRoomService],
  controllers: [DataRoomController],
  exports: [DataRoomService],
})
export class DataRoomModule {}
