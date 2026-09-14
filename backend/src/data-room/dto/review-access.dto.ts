import { IsEnum } from "class-validator";
import { DataRoomAccessStatus } from "../../common/enums";

export class ReviewAccessDto {
  @IsEnum(DataRoomAccessStatus) status!: DataRoomAccessStatus;
}
