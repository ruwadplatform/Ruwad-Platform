import { IsUUID } from "class-validator";

export class AddCohortMemberDto {
  @IsUUID() startupId!: string;
}
