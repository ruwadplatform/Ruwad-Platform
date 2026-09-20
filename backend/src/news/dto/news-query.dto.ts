import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

/** GET /news filters: category, country (or region label), publication date range. */
export class NewsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
