import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";

/** Called by the Python training CLI after a run completes — never by a
 * human admin directly. `status` is deliberately not a field here: the
 * service always derives it from `isTestOnly` (TEST_ONLY or CANDIDATE),
 * so a caller cannot register a model as anything else, ever. */
export class RegisterMlModelDto {
  @IsString() modelVersion!: string;
  @IsString() targetName!: string;
  @IsString() targetVersion!: string;
  @IsString() featureSchemaVersion!: string;
  @IsString() algorithm!: string;
  @IsOptional() @IsObject() hyperparameters?: Record<string, unknown>;
  @IsInt() @Min(0) trainingRows!: number;
  @IsInt() @Min(0) validationRows!: number;
  @IsInt() @Min(0) testRows!: number;
  @IsOptional() @IsDateString() trainingPeriodStart?: string;
  @IsOptional() @IsDateString() trainingPeriodEnd?: string;
  @IsOptional() @IsObject() metrics?: Record<string, unknown>;
  @IsString() artifactLocation!: string;
  @IsOptional() @IsBoolean() isTestOnly?: boolean;
  @IsOptional() @IsDateString() trainedAt?: string;
}
