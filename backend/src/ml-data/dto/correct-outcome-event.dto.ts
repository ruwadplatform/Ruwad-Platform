import { IsString, MaxLength, MinLength } from "class-validator";

/** The only field an outcome event may be corrected on is valueText — the
 * control vocabulary the label engine matches literally (a destination
 * country for MARKET_ENTRY, a regulatory-ladder stage for
 * REGULATORY_MILESTONE/APPROVAL). `reason` is mandatory and is written into
 * the event's notes together with the previous value. */
export class CorrectOutcomeEventDto {
  @IsString() @MinLength(1) @MaxLength(500) valueText!: string;
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
}
