import { IsEnum, IsString, IsUUID, ValidateIf } from "class-validator";
import { WatchlistKind } from "../../common/enums";

/** Accepts either the real entity UUID or its slug (the frontend's
 * directory pages still key entities by slug, not the backend id, until
 * the directory-listing components themselves are migrated off local mock
 * data) — exactly one of the two must be given. */
export class ToggleWatchlistDto {
  @IsEnum(WatchlistKind) kind!: WatchlistKind;
  @ValidateIf((o) => !o.slug) @IsUUID() entityId?: string;
  @ValidateIf((o) => !o.entityId) @IsString() slug?: string;
}
