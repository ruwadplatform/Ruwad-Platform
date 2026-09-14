import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataRoomAccess } from "./data-room-access.entity";
import { DocumentRef } from "../directory-shared/document-ref.entity";
import { DataRoomService } from "./data-room.service";
import { DataRoomController } from "./data-room.controller";

@Module({
  imports: [TypeOrmModule.forFeature([DataRoomAccess, DocumentRef])],
  providers: [DataRoomService],
  controllers: [DataRoomController],
  exports: [DataRoomService],
})
export class DataRoomModule {}
