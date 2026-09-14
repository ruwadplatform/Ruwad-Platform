import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class QueryStartupsDto extends PaginationQueryDto {
  @IsOptional() @IsString() sector?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
}
