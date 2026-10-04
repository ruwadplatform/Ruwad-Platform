import { IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { MlTrainingRunStatus } from "../../common/enums";

/** Called by the Python training CLI, both for a successful/failed run and
 * for one the readiness gate blocked before training started (`status:
 * BLOCKED_NOT_READY`, no `modelVersion`) — the audit trail exists either
 * way. */
export class RecordTrainingRunDto {
  @IsString() targetName!: string;
  @IsString() targetVersion!: string;
  @IsString() featureSchemaVersion!: string;
  @IsString() algorithm!: string;
  @IsEnum(MlTrainingRunStatus) status!: MlTrainingRunStatus;
  @IsDateString() startedAt!: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsInt() @Min(0) datasetRows?: number;
  @IsOptional() @IsObject() metrics?: Record<string, unknown>;
  @IsOptional() @IsObject() hyperparameters?: Record<string, unknown>;
  @IsOptional() @IsString() modelVersion?: string;
  @IsOptional() @IsString() artifactLocation?: string;
  @IsOptional() @IsString() errorMessage?: string;
  @IsString() createdBy!: string;
  @IsOptional() @IsBoolean() isTestOnly?: boolean;
}
