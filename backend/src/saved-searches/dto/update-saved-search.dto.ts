import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateSavedSearchDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsBoolean() alertEnabled?: boolean;
}
