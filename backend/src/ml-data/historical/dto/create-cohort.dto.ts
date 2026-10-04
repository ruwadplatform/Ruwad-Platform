import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCohortDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsDateString() snapshotDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceDescription?: string;
}
