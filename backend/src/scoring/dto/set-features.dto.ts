import { IsIn, IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";
import { ScoreDataSource } from "../../common/enums";

/** Admin-only structured write to a startup's scoring inputs. `features` is
 * validated as a plain object here (its keys are checked/normalized inside
 * ScoringService/the engines, which already treat any unrecognized or
 * out-of-range value as absent rather than trusting client-shaped input
 * blindly) — every write is still required to carry a reason and is fully
 * audited (see StartupScoringFeatureAudit). */
export class SetScoringFeaturesDto {
  @IsObject() features!: Record<string, unknown>;

  @IsIn(Object.values(ScoreDataSource)) source!: ScoreDataSource;

  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
