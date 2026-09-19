import { IsEmail, IsString, MaxLength } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254) email!: string;
}

/** Only shape/size is checked here. The password rules, token validity and
 * "different from current password" checks live in AuthService so each
 * failure returns its own specific message instead of a generic
 * validation-pipe error. */
export class ResetPasswordDto {
  @IsString() @MaxLength(200) token!: string;
  @IsString() @MaxLength(200) password!: string;
  @IsString() @MaxLength(200) confirmPassword!: string;
}
