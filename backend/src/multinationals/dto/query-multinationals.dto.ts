import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class QueryMultinationalsDto extends PaginationQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() country?: string;
}
