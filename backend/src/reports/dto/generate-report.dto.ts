import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";
import { REPORT_KINDS, type ReportKind } from "../report-types";

export class GenerateReportDto {
  @IsIn(REPORT_KINDS as unknown as string[]) kind!: ReportKind;

  /** A RUWĀD sector/category, e.g. "Digital Health". Optional: omitted = all healthcare. */
  @IsOptional() @IsString() @MaxLength(80) sector?: string;

  /** Required for Individual Startup Analysis. */
  @ValidateIf((o: GenerateReportDto) => o.kind === "STARTUP_ANALYSIS")
  @IsString() @MaxLength(160) @Matches(/^[a-z0-9-]+$/, { message: "startupSlug must be a startup slug" })
  startupSlug?: string;
}
