import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/** The six digits, as typed or pasted (spaces and dashes are tolerated and removed by the server). `email` is only needed from a browser that did not start the
 * sign-up (the pending-verification cookie normally says who this is). */
export class VerifyEmailDto {
  @IsString() @MaxLength(32) code!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}

export class ResendVerificationDto {
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
}
