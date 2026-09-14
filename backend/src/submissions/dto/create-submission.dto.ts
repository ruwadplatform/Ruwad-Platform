import { IsEnum } from "class-validator";
import { EntityKind } from "../../common/enums";

/** Starts a new DRAFT — just the entity type. Everything else is filled in
 * via autosave PATCHes as the user works through the wizard. */
export class CreateSubmissionDto {
  @IsEnum(EntityKind) kind!: EntityKind;
}
