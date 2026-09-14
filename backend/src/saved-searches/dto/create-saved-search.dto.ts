import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

export class CreateSavedSearchDto {
  @IsString() entityType!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsObject() filters?: Record<string, string[]>;
  @IsOptional() @IsInt() @Min(0) resultCount?: number;
}
