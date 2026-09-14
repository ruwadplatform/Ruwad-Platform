import { IsOptional, IsString } from "class-validator";

export class CreateIntroductionDto {
  @IsOptional() @IsString() investor?: string;
  @IsOptional() @IsString() startup?: string;
  @IsOptional() @IsString() reasonType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() message?: string;
}
