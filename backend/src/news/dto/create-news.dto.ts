import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { EntityKind } from "../../common/enums";

class RelatedEntityDto {
  @IsString() entityType!: EntityKind;
  @IsString() entityId!: string;
  @IsOptional() @IsString() entitySlug?: string;
  @IsString() name!: string;
}

export class CreateNewsDto {
  @IsString() title!: string;
  @IsString() source!: string;
  @IsDateString() publishedDate!: string;
  @IsString() category!: string;
  @IsString() sector!: string;
  @IsString() geography!: string;
  @IsString() summary!: string;
  @IsString() sourceUrl!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RelatedEntityDto)
  relatedEntities?: RelatedEntityDto[];
}
