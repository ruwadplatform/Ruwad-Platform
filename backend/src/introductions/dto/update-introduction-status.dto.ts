import { IsEnum } from "class-validator";
import { IntroductionStatus } from "../../common/enums";

export class UpdateIntroductionStatusDto {
  @IsEnum(IntroductionStatus) status!: IntroductionStatus;
}
