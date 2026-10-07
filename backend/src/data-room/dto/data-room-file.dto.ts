import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { DATA_ROOM_CATEGORIES } from "../data-room-files.service";

export class UploadDataRoomFileDto {
  @IsIn(DATA_ROOM_CATEGORIES as unknown as string[]) category!: string;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
}

export class UpdateDataRoomFileDto {
  @IsOptional() @IsIn(DATA_ROOM_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsString() @MaxLength(150) name?: string;
}
