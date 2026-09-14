import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UploadedImage } from "./uploaded-image.entity";
import { UploadsService } from "./uploads.service";
import { UploadsController } from "./uploads.controller";

@Module({
  imports: [TypeOrmModule.forFeature([UploadedImage])],
  providers: [UploadsService],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}
