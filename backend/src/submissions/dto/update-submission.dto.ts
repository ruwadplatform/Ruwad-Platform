import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, MaxLength } from "class-validator";

/** Autosave PATCH while the submission is still a DRAFT (or being edited
 * after CHANGES_REQUESTED) — payload is merged shallowly server-side, not
 * replaced, so a stale client never wipes fields it didn't render. */
export class UpdateSubmissionDto {
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(64) currentStep?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) completionPercentage?: number;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
}

export class RequestChangesDto {
  @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(100) section?: string;
}

export class RejectDto {
  @IsString() @MaxLength(2000) reason!: string;
  @IsOptional() @IsString() @MaxLength(2000) internalNote?: string;
}

export class FindSubmissionsQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["asc", "desc"]) order?: "asc" | "desc";
}
