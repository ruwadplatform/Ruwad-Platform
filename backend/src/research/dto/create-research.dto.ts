import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class ProjectDto {
  @IsString() title!: string;
  @IsString() area!: string;
  @IsString() status!: string;
  @IsInt() startYear!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) partners?: string[];
}
class PublicationDto {
  @IsString() title!: string;
  @IsString() area!: string;
  @IsString() authors!: string;
  @IsString() journal!: string;
  @IsInt() year!: number;
}
class TechnologyDto {
  @IsString() name!: string;
  @IsString() area!: string;
  @IsInt() trl!: number;
  @IsString() status!: string;
}
class ResearcherDto {
  @IsString() name!: string;
  @IsString() title!: string;
  @IsString() area!: string;
}

export class CreateResearchDto {
  @IsString() name!: string;
  @IsOptional() @IsUUID() logoImageId?: string;
  @IsString() type!: string;
  @IsString() city!: string;
  @IsString() country!: string;
  @IsInt() founded!: number;
  @IsString() website!: string;
  @IsInt() numResearchers!: number;
  @IsInt() numCenters!: number;
  @IsInt() numLabs!: number;
  @IsString() about!: string;
  @IsOptional() @IsIn(["Open", "Selective", "Closed"]) collaborationStatus?: "Open" | "Selective" | "Closed";
  @IsInt() technologyReadinessLevel!: number;
  @IsInt() patentsCount!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) sectors?: string[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProjectDto) @ArrayMaxSize(30) projects?: ProjectDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PublicationDto) @ArrayMaxSize(50) publications?: PublicationDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TechnologyDto) @ArrayMaxSize(30) technologies?: TechnologyDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ResearcherDto) @ArrayMaxSize(30) researchers?: ResearcherDto[];
}
