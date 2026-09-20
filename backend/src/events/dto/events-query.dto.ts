import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../common/pagination.dto";

/** GET /events filters. With no `status` the default view is ONGOING +
 * UPCOMING (never past events); pass status=PAST or ALL to see others. */
export class EventsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsIn(["ONGOING", "UPCOMING", "PAST", "ALL"]) status?: "ONGOING" | "UPCOMING" | "PAST" | "ALL";
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
