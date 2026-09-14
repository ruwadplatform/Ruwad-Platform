import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class QueryResearchDto extends PaginationQueryDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() collaborationStatus?: string;
}
