import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  jobTitle?: string;

  @IsOptional() @IsString() @MaxLength(150)
  organization?: string;

  @IsOptional() @IsString() @MaxLength(200)
  organizationWebsite?: string;

  @IsOptional() @IsString() @MaxLength(80)
  organizationStage?: string;

  @IsOptional() @IsString() @MaxLength(80)
  organizationCategory?: string;

  @IsOptional() @IsString() @MaxLength(80)
  organizationCity?: string;

  @IsOptional() @IsString() @MaxLength(80)
  organizationType?: string;

  @IsOptional() @IsString() @MaxLength(80)
  country?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  bio?: string;

  @IsOptional() @IsString() @MaxLength(200)
  linkedin?: string;

  /** Id returned by POST /uploads/avatar; null removes the photo. */
  @IsOptional() @IsUUID()
  profileImageId?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true })
  interests?: string[];
}
