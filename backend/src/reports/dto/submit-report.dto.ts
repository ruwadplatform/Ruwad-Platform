import { Type } from "class-transformer";
import { ArrayMaxSize, Equals, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, IsUrl, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { SUBMISSION_GEOGRAPHIES, SUBMISSION_REPORT_TYPES, SUBMISSION_SECTORS } from "../report-submission.constants";

const HTTP_URL = { protocols: ["http", "https"], require_protocol: true, require_tld: true };

export class SourceLinkDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsUrl(HTTP_URL) @MaxLength(500) url!: string;
}

export class SubmitReportDto {
  /** Created when the form opens; a repeated submit with the same key returns the first request instead of a duplicate. */
  @IsUUID("4") idempotencyKey!: string;

  @IsString() @MinLength(5) @MaxLength(200) title!: string;
  @IsIn(SUBMISSION_REPORT_TYPES as unknown as string[]) reportType!: string;
  @IsIn(SUBMISSION_SECTORS as unknown as string[]) sector!: string;
  @IsIn(SUBMISSION_GEOGRAPHIES as unknown as string[]) geography!: string;
  /** A year ("2026") or a full date ("2026-03-15"). */
  @IsOptional() @Matches(/^\d{4}(-\d{2}-\d{2})?$/, { message: "publicationDate must be a year (2026) or a date (2026-03-15)" }) publicationDate?: string;

  @IsString() @MinLength(20) @MaxLength(600) description!: string;
  @IsString() @MinLength(50) @MaxLength(5000) executiveSummary!: string;

  @IsString() @MinLength(2) @MaxLength(120) authorName!: string;
  @IsString() @MinLength(2) @MaxLength(160) organizationName!: string;
  @IsEmail() @MaxLength(200) authorEmail!: string;
  @IsOptional() @IsUrl(HTTP_URL) @MaxLength(300) website?: string;
  @IsOptional() @IsUrl(HTTP_URL) @MaxLength(300) linkedin?: string;

  @IsOptional() @IsUrl(HTTP_URL) @MaxLength(500) reportUrl?: string;
  /** Id returned by POST /reports/submissions/file. */
  @IsOptional() @IsUUID("4") fileId?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SourceLinkDto) sources?: SourceLinkDto[];

  @Equals(true, { message: "You must confirm the declaration to submit a report" }) declaration!: boolean;
}

export class RejectReviewDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
