import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Introduction } from "./introduction.entity";
import { IntroductionsService } from "./introductions.service";
import { IntroductionsController } from "./introductions.controller";
import { ActivityModule } from "../activity/activity.module";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [TypeOrmModule.forFeature([Introduction]), ActivityModule, UsersModule, EmailModule],
  providers: [IntroductionsService],
  controllers: [IntroductionsController],
  exports: [IntroductionsService],
})
export class IntroductionsModule {}
