import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;
}

/** Same password rule as RegisterDto (8–200 chars). */
export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200) token!: string;
  @IsString() @MinLength(8) @MaxLength(200) password!: string;
  @IsString() @MaxLength(200) confirmPassword!: string;
}
