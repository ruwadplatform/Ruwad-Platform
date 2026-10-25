import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { ConsultationTypeId } from "../advisory.enums";
import { HHMM_PATTERN, YMD_PATTERN } from "../advisory-time";

const HHMM = Matches(HHMM_PATTERN, { message: "must be a time like 09:30" });

/** Free text that people type: trimmed by the services; the NUL-byte pipe already runs globally. */
export class AdvisorProfileDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 160) institution!: string;
  @IsString() @Length(2, 200) institutionFull!: string;
  @IsString() @Length(2, 120) designation!: string;
  @IsString() @Length(2, 120) location!: string;
  @IsString() @Length(2, 120) specialization!: string;
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(80, { each: true }) specializations!: string[];
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(120, { each: true }) researchAreas!: string[];
  @IsString() @Length(2, 300) expertise!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(60, { each: true }) expertiseTags?: string[];
  @IsString() @Length(20, 3000) about!: string;
  @IsOptional() @IsInt() @Min(0) @Max(70) yearsExperience?: number;
}

export class UpdateAdvisorProfileDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(2, 160) institution?: string;
  @IsOptional() @IsString() @Length(2, 200) institutionFull?: string;
  @IsOptional() @IsString() @Length(2, 120) designation?: string;
  @IsOptional() @IsString() @Length(2, 120) location?: string;
  @IsOptional() @IsString() @Length(2, 120) specialization?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(80, { each: true }) specializations?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(120, { each: true }) researchAreas?: string[];
  @IsOptional() @IsString() @Length(2, 300) expertise?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(60, { each: true }) expertiseTags?: string[];
  @IsOptional() @IsString() @Length(20, 3000) about?: string;
  @IsOptional() @IsInt() @Min(0) @Max(70) yearsExperience?: number;
}

export class WeeklyWindowDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @HHMM startTime!: string;
  @HHMM endTime!: string;
}

/** Replaces the advisor's whole weekly schedule. */
export class SetAvailabilityDto {
  @IsArray() @ArrayMaxSize(70) @ValidateNested({ each: true }) @Type(() => WeeklyWindowDto) windows!: WeeklyWindowDto[];
}

export class TimeOffDto {
  @Matches(YMD_PATTERN, { message: "must be a date like 2026-11-05" }) date!: string;
  @IsOptional() @HHMM startTime?: string;
  @IsOptional() @HHMM endTime?: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class CreateServiceDto {
  @IsEnum(ConsultationTypeId) typeId!: ConsultationTypeId;
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 400) description!: string;
  @IsInt() @Min(15) @Max(240) minutes!: number;
}

export class UpdateServiceDto {
  @IsOptional() @IsEnum(ConsultationTypeId) typeId?: ConsultationTypeId;
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @Length(2, 400) description?: string;
  @IsOptional() @IsInt() @Min(15) @Max(240) minutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateBookingDto {
  /** The advisor's URL id (slug). */
  @IsString() @Length(2, 80) advisor!: string;
  @IsUUID() serviceId!: string;
  @IsUUID() startupId!: string;
  /** The chosen slot's start, an ISO-8601 instant. The server accepts it only if it is exactly one of the slots it offers. */
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class ProposeRescheduleDto {
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class NoteDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SlotQueryDto {
  @IsUUID() serviceId!: string;
  @Matches(YMD_PATTERN, { message: "must be a date like 2026-11-05" }) date!: string;
}

export class DatesQueryDto {
  @IsUUID() serviceId!: string;
}

export class BookingListQueryDto {
  @IsOptional() @IsString() @MaxLength(40) status?: string;
  @IsOptional() @IsString() @MaxLength(20) when?: string;
  @IsOptional() @IsUUID() advisorId?: string;
  @IsOptional() @IsString() @MaxLength(5) includeDemo?: string;
}

export class ReviewAdvisorDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class VerificationDto {
  @IsBoolean() affiliationVerified!: boolean;
}
