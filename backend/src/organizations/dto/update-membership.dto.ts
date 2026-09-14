import { IsEnum, IsOptional } from "class-validator";
import { ListingStatus, ListingVisibility } from "../../common/enums";

export class UpdateMembershipDto {
  @IsOptional() @IsEnum(ListingStatus) listingStatus?: ListingStatus;
  @IsOptional() @IsEnum(ListingVisibility) listingVisibility?: ListingVisibility;
}
