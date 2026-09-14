import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class ProgramDto {
  @IsString() name!: string;
  @IsString() type!: string;
  @IsString() status!: string;
  @IsString() duration!: string;
  @IsString() location!: string;
  @IsString() format!: string;
  @IsString() deadline!: string;
  @IsString() cohortSize!: string;
}

export class CreateHubDto {
  @IsString() name!: string;
  @IsOptional() @IsUUID() logoImageId?: string;
  @IsString() type!: string;
  @IsString() city!: string;
  @IsString() country!: string;
  @IsInt() founded!: number;
  @IsString() website!: string;
  @IsString() operatingRegion!: string;
  @IsString() ownershipType!: string;
  @IsOptional() @IsIn(["Open", "Closed"]) status?: "Open" | "Closed";
  @IsString() deadline!: string;
  @IsString() desc!: string;
  @IsString() about!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sectors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) stagesSupported?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) geographicCoverage?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) support?: string[];
  @IsString() fundingAvailable!: string;
  @IsString() fundingType!: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProgramDto) @ArrayMaxSize(20)
  programs?: ProgramDto[];
}
