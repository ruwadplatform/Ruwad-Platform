import { IsEnum, IsUUID } from "class-validator";
import { EntityKind } from "../../common/enums";

export class RequestAccessDto {
  @IsEnum(EntityKind) kind!: EntityKind;
  @IsUUID() entityId!: string;
}
