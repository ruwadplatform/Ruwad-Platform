import { ArrayMinSize, ArrayMaxSize, IsArray, IsString } from "class-validator";

/** Admin-only: marks a batch of a startup's existing feature values as
 * verified (bumps their provenance to VERIFIED_DOCUMENT) without changing
 * the values themselves — see ScoringService.verifyFeatures(). */
export class VerifyFeaturesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  keys!: string[];
}
