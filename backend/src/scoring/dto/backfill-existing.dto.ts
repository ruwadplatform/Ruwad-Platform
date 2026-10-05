import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from "class-validator";

/** Admin-only body for POST scoring/admin/backfill-existing. `dryRun` defaults to TRUE: nothing is written unless the caller sends
 * `dryRun: false` explicitly. */
export class BackfillExistingStartupsDto {
  @IsOptional() @IsBoolean()
  dryRun?: boolean;

  /** Optional subset (e.g. to apply to one startup first). Omit to cover every existing startup. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID("4", { each: true })
  startupIds?: string[];
}
