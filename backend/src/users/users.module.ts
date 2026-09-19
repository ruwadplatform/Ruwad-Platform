import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserSettings } from "./user-settings.entity";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { ActivityModule } from "../activity/activity.module";
import { UploadsModule } from "../uploads/uploads.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSettings]), ActivityModule, UploadsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
