import { IsBoolean, IsOptional } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() emailNotifications?: boolean;
  @IsOptional() @IsBoolean() introRequestAlerts?: boolean;
  @IsOptional() @IsBoolean() savedSearchAlerts?: boolean;
  @IsOptional() @IsBoolean() weeklyDigest?: boolean;
  @IsOptional() @IsBoolean() profileVisibleToGuests?: boolean;
  @IsOptional() @IsBoolean() showContactInfo?: boolean;
}
