import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { OutcomeEventSource, StartupOutcomeEventType } from "../../common/enums";

/** Admin-only. `source`/`verified` are separate fields on purpose — an
 * admin entering a claim doesn't make it verified; that's a distinct,
 * deliberate signal (see StartupOutcomeEvent's own doc comment). */
export class CreateOutcomeEventDto {
  @IsEnum(StartupOutcomeEventType) eventType!: StartupOutcomeEventType;
  @IsDateString() eventDate!: string;
  @IsOptional() @IsNumber() valueNumeric?: number;
  @IsOptional() @IsString() @MaxLength(500) valueText?: string;
  @IsEnum(OutcomeEventSource) source!: OutcomeEventSource;
  @IsOptional() @IsBoolean() verified?: boolean;
  @IsOptional() @IsUUID() sourceDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
