import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateEventDto {
  @IsString() name!: string;
  @IsDateString() date!: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsString() location!: string;
  @IsString() country!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() venue?: string;
  @IsString() type!: string;
  @IsString() sector!: string;
  @IsString() organizer!: string;
  @IsString() description!: string;
  @IsOptional() @IsIn(["Open", "Closed", "Coming Soon"]) registrationStatus?: "Open" | "Closed" | "Coming Soon";
  @IsString() url!: string;
  @IsOptional() @IsUrl() registrationUrl?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}
