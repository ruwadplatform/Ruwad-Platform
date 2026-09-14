import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

class TeamMemberDto {
  @IsString() name!: string;
  @IsString() title!: string;
}

export class CreateInvestorDto {
  @IsString() name!: string;
  @IsOptional() @IsUUID() logoImageId?: string;
  @IsString() short!: string;
  @IsString() type!: string;
  @IsString() city!: string;
  @IsInt() founded!: number;
  @IsString() desc!: string;
  @IsString() thesis!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) stageFocus?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sectors?: string[];
  @IsString() ticket!: string;
  @IsString() aum!: string;
  @IsString() available!: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => TeamMemberDto) @ArrayMaxSize(30)
  team?: TeamMemberDto[];
}
