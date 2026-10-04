import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { HistoricalEvidenceSourceType } from "../../../common/enums";

/** The CSV file itself arrives via multer (@UploadedFile()), not this DTO —
 * these are the other multipart form fields sent alongside it. */
export class UploadHistoricalBatchDto {
  @IsString() @MaxLength(200) sourceName!: string;
  @IsEnum(HistoricalEvidenceSourceType) sourceType!: HistoricalEvidenceSourceType;

  /** Multipart fields always arrive as strings. Deliberately typed as a
   * string here, never `boolean` — the global ValidationPipe's
   * `transformOptions.enableImplicitConversion: true` coerces any
   * non-empty string (including the literal "false") to `true` when a
   * property is declared `boolean`, which silently turned a real commit
   * into a dry run. The controller compares this string to "true"
   * explicitly instead of trusting an implicit conversion. */
  @IsOptional() @IsIn(["true", "false"]) dryRun?: string;
}
