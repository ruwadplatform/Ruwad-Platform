import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { EntityKind } from "../../common/enums";

export class CreateListingClaimDto {
  @IsEnum(EntityKind) kind!: EntityKind;
  @IsUUID() entityId!: string;
  @IsString() @MaxLength(120) role!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
