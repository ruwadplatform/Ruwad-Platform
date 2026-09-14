import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { EntityKind, MembershipRole } from "../../common/enums";

export class CreateMembershipDto {
  @IsUUID() userId!: string;
  @IsEnum(EntityKind) kind!: EntityKind;
  @IsUUID() entityId!: string;
  @IsOptional() @IsEnum(MembershipRole) role?: MembershipRole;
}
