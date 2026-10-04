import { IsEnum } from "class-validator";
import { MlModelStatus } from "../../common/enums";

export class UpdateMlModelStatusDto {
  @IsEnum(MlModelStatus) status!: MlModelStatus;
}
