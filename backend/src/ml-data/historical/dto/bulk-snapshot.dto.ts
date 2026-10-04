import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { SnapshotSelectionMethod } from "../../../common/enums";

export class BulkSnapshotDto {
  @IsDateString() snapshotDate!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsEnum(SnapshotSelectionMethod) selectionMethod?: SnapshotSelectionMethod;
  @IsOptional() @IsIn(["ACCEPTABLE", "RICH"]) minDensity?: "ACCEPTABLE" | "RICH";
}

export class TagSelectionMethodDto {
  @IsEnum(SnapshotSelectionMethod) selectionMethod!: SnapshotSelectionMethod;
}
