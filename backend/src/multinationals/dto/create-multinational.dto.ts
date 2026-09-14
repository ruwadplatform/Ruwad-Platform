import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class ProductDto {
  @IsString() name!: string;
  @IsString() category!: string;
  @IsString() description!: string;
}

export class CreateMultinationalDto {
  @IsString() name!: string;
  @IsOptional() @IsUUID() logoImageId?: string;
  @IsString() category!: string;
  @IsString() subsector!: string;
  @IsString() tagline!: string;
  @IsString() country!: string;
  @IsString() city!: string;
  @IsString() hq!: string;
  @IsInt() founded!: number;
  @IsString() businessModel!: string;
  @IsInt() employees!: number;
  @IsString() companySize!: string;
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

  @IsOptional() @IsBoolean() saudiOffice?: boolean;
  @IsOptional() @IsBoolean() regionalHeadquarters?: boolean;
  @IsOptional() @IsBoolean() manufacturing?: boolean;
  @IsOptional() @IsBoolean() distribution?: boolean;
  @IsOptional() @IsBoolean() clinicalOperations?: boolean;
  @IsOptional() @IsBoolean() trainingCenters?: boolean;
  @IsOptional() @IsBoolean() researchOperations?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) countriesActiveIn?: string[];
  @IsString() regionalEmployees!: string;

  @IsString() rdFocus!: string;
  @IsInt() rdCenters!: number;
  @IsOptional() @IsBoolean() openInnovation?: boolean;
  @IsOptional() @IsBoolean() startupCollaboration?: boolean;
  @IsOptional() @IsBoolean() partnershipInterest?: boolean;
  @IsOptional() @IsBoolean() techScouting?: boolean;

  @IsString() legalName!: string;
  @IsString() website!: string;
  @IsString() email!: string;
  @IsString() phone!: string;
  @IsString() linkedin!: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductDto) @ArrayMaxSize(20)
  products?: ProductDto[];
}
