import { IsString, IsUUID, MaxLength } from "class-validator";

export class ResolveConflictDto {
  @IsUUID() preferredId!: string;
  @IsString() @MaxLength(1000) reason!: string;
}

export class LeaveUnresolvedDto {
  @IsString() @MaxLength(1000) reason!: string;
}
