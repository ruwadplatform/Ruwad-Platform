import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString } from "class-validator";

export class CreateReportDto {
  @IsString() title!: string;
  @IsString() category!: string;
  @IsString() reportType!: string;
  @IsDateString() publicationDate!: string;
  @IsString() description!: string;
  @IsString() geography!: string;
  @IsString() sector!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) authors?: string[];
  @IsString() readingTime!: string;
  @IsInt() pages!: number;
  @IsOptional() @IsArray() @IsIn(["Featured", "New", "Premium", "Ruwād Research"], { each: true }) badges?: string[];
  @IsString() executiveSummary!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keyFindings?: string[];
  @IsOptional() @IsArray() marketStats?: { label: string; value: string }[];
  @IsOptional() @IsArray() sections?: { heading: string; body: string }[];
  @IsOptional() @IsArray() @IsString({ each: true }) sources?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) relatedStartupIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) relatedInvestorIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) relatedReportIds?: string[];
}
