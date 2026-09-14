import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class QueryHubsDto extends PaginationQueryDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() status?: string;
}
