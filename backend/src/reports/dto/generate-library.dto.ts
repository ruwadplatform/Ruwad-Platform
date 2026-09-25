import { IsArray, IsBoolean, IsIn, IsOptional } from "class-validator";
import { LIBRARY_DEFINITIONS } from "../library/library-definitions";

export class GenerateLibraryDto {
  /** Only these library reports (default: all six). */
  @IsOptional() @IsArray() @IsIn(LIBRARY_DEFINITIONS.map((d) => d.slug), { each: true }) slugs?: string[];
  /** true: every complete report is published (an existing draft too). Omitted: new reports are published and existing ones keep their visibility. false: new reports are saved as drafts. */
  @IsOptional() @IsBoolean() publish?: boolean;
  /** Verify and assemble everything but save nothing. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
  /** Skip the Serper "further reading" step. */
  @IsOptional() @IsBoolean() skipResearch?: boolean;
}
