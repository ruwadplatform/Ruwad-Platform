import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./user.entity";
import { UserSettings } from "./user-settings.entity";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserSettings]), ActivityModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
