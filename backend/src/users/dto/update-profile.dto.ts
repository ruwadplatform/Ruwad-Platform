import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  jobTitle?: string;

  @IsOptional() @IsString() @MaxLength(150)
  organization?: string;

  @IsOptional() @IsString() @MaxLength(80)
  country?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  bio?: string;

  @IsOptional() @IsString() @MaxLength(200)
  linkedin?: string;
}
