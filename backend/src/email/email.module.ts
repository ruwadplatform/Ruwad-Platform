import { Module } from "@nestjs/common";
import { EmailService } from "./email.service";

/** Not @Global() — imported explicitly by every module that needs to send
 * a notification (submissions, data-room, introductions), same pattern
 * ActivityModule already uses across this codebase. */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
