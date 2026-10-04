import { IsBoolean, IsDateString, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { FeatureApplicabilityStatus, FoundedYearBasis, HistoricalSubmissionKind, OutcomeCoverageMethod, OutcomeCoverageType, ScoreDataSource, SourceReliability, TrainingEligibility } from "../../common/enums";

/** A founder's (or admin's) historical entry. `entry` is validated per kind
 * by validateEntry(); the surrounding fields are deliberately minimal —
 * there is NO source, verified or status field a founder could set, and the
 * global ValidationPipe rejects any property not declared here. */
export class SubmitHistoricalEntryDto {
  @IsEnum(HistoricalSubmissionKind) kind!: HistoricalSubmissionKind;
  @IsObject() entry!: Record<string, unknown>;
  @IsOptional() @IsUUID() supportingDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(60) supportingDocumentType?: string;
  @IsOptional() @IsString() @MaxLength(2000) founderNote?: string;
}

export class ResubmitHistoricalEntryDto {
  @IsObject() entry!: Record<string, unknown>;
  @IsOptional() @IsUUID() supportingDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(60) supportingDocumentType?: string;
  @IsOptional() @IsString() @MaxLength(2000) founderNote?: string;
}

export class ReviewHistoricalEntryDto {
  @IsIn(["VERIFY", "REJECT", "REQUEST_CORRECTION"]) action!: "VERIFY" | "REJECT" | "REQUEST_CORRECTION";
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() documentValidated?: boolean;
  @IsOptional() @IsBoolean() confirmNotDuplicate?: boolean;
}

export class DeclareApplicabilityDto {
  @IsString() @MaxLength(80) featureKey!: string;
  @IsEnum(FeatureApplicabilityStatus) status!: FeatureApplicabilityStatus;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional() @IsIn([ScoreDataSource.ADMIN_ENTERED, ScoreDataSource.VERIFIED_DOCUMENT, ScoreDataSource.EXTERNAL_SOURCE]) source?: ScoreDataSource;
  @IsOptional() @IsBoolean() verified?: boolean;
  @IsOptional() @IsUUID() sourceDocumentId?: string;
}

export class RevokeDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}

export class AttestCoverageDto {
  @IsEnum(OutcomeCoverageType) coverageType!: OutcomeCoverageType;
  @IsDateString() coverageThrough!: string;
  @IsString() @MinLength(10) @MaxLength(1000) sourceSummary!: string;
  @IsEnum(OutcomeCoverageMethod) method!: OutcomeCoverageMethod;
  @IsEnum(SourceReliability) confidence!: SourceReliability;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class SetTrainingEligibilityDto {
  @IsEnum(TrainingEligibility) eligibility!: TrainingEligibility;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class SetFoundedBasisDto {
  @IsEnum(FoundedYearBasis) basis!: FoundedYearBasis;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
