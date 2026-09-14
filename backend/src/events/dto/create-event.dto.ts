import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateEventDto {
  @IsString() name!: string;
  @IsDateString() date!: string;
  @IsString() location!: string;
  @IsString() country!: string;
  @IsString() type!: string;
  @IsString() sector!: string;
  @IsString() organizer!: string;
  @IsString() description!: string;
  @IsOptional() @IsIn(["Open", "Closed", "Coming Soon"]) registrationStatus?: "Open" | "Closed" | "Coming Soon";
  @IsString() url!: string;
}
