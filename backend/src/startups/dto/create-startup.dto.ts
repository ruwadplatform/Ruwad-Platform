import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from "class-validator";

class TeamMemberDto {
  @IsString() name!: string;
  @IsString() title!: string;
  @IsOptional() @IsBoolean() isFounder?: boolean;
}
class FundingRoundDto {
  @IsString() round!: string;
  @IsString() date!: string;
  @IsNumber() amount!: number;
  @IsString() lead!: string;
}
class DocumentDto {
  @IsString() name!: string;
  @IsBoolean() onFile!: boolean;
}
class ProductDto {
  @IsString() name!: string;
  @IsString() category!: string;
  @IsString() description!: string;
}

export class CreateStartupDto {
  @IsString() name!: string;
  @IsOptional() @IsUUID() logoImageId?: string;
  @IsString() category!: string;
  @IsString() subsector!: string;
  @IsString() tagline!: string;
  @IsString() country!: string;
  @IsString() city!: string;
  @IsString() hq!: string;
  @IsInt() @Min(1980) @Max(2100) founded!: number;
  @IsString() stage!: string;
  @IsOptional() @IsString() status?: string;
  @IsString() businessModel!: string;
  @IsInt() @Min(0) employees!: number;
  @IsNumber() @Min(0) fundingTotal!: number;
  @IsNumber() @Min(0) valuation!: number;
  @IsOptional() @IsBoolean() fundraising?: boolean;
  @IsOptional() @IsString() targetRaise?: string;
  @IsString() desc!: string;
  @IsString() problem!: string;
  @IsString() solution!: string;
  @IsString() advantage!: string;

  @IsString() sfda!: string;
  @IsString() fda!: string;
  @IsString() ce!: string;
  @IsString() clinicalStatus!: string;
  @IsString() patentStatus!: string;
  @IsString() marketTam!: string;
  @IsString() marketSam!: string;
  @IsString() marketSom!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) marketCompetitors?: string[];

  @IsString() legalName!: string;
  @IsOptional() @IsString() formerName?: string;
  @IsString() website!: string;
  @IsString() email!: string;
  @IsString() phone!: string;
  @IsString() linkedin!: string;

  @IsOptional() @IsArray() @IsString({ each: true }) sectors?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TeamMemberDto) @ArrayMaxSize(30)
  team?: TeamMemberDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FundingRoundDto) @ArrayMaxSize(30)
  rounds?: FundingRoundDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DocumentDto) @ArrayMaxSize(20)
  documents?: DocumentDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductDto) @ArrayMaxSize(20)
  products?: ProductDto[];
}
