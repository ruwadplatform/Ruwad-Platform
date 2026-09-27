import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectListingClaimDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
