import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "../../common/enums";

const SIGNUP_ROLES = [UserRole.USER, UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ORGANIZATION_ADMIN];

export class RegisterDto {
  @IsString() @MaxLength(80) firstName!: string;
  @IsString() @MaxLength(80) lastName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;

  @IsOptional() @IsIn(SIGNUP_ROLES)
  role?: UserRole;

  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(150) organization?: string;
  @IsOptional() @IsString() @MaxLength(200) organizationWebsite?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationStage?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationCategory?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationCity?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationType?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true })
  interests?: string[];
}
