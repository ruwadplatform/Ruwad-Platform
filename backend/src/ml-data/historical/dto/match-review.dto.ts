import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { STARTUP_CATEGORIES } from "../startup-categories";

export class ConfirmMatchDto {
  @IsUUID() startupId!: string;
}

/** Data-maintenance only: corrects a startup's category to a supported value. */
export class CorrectStartupCategoryDto {
  @IsIn([...STARTUP_CATEGORIES]) category!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class CreateStartupForIdentityDto {
  @IsString() @MaxLength(80) category!: string;
  @IsString() @MaxLength(80) subsector!: string;
  @IsString() @MaxLength(80) country!: string;
  @IsInt() @Min(1990) @Max(2100) founded!: number;
  @IsString() @MaxLength(40) stage!: string;
  @IsOptional() @IsString() @MaxLength(200) tagline?: string;
}
