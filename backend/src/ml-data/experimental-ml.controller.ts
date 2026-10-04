import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { MlExperimentalInferenceService } from "./ml-experimental-inference.service";

/** Admin-only surface for the EXPERIMENTAL live model. Nothing here is reachable by founders, investors or the public, and none of it is
 * ever merged into a RUWAD Score. The prediction is returned beside the startup, not inside the score. */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data/experimental")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class ExperimentalMlController {
  constructor(private readonly experimental: MlExperimentalInferenceService) {}

  @Get("monitoring")
  monitoring() {
    return this.experimental.monitoring();
  }

  /** Latest stored prediction (+ short history) for one startup. Read-only: opening a page never creates a row. */
  @Get("startups/:id")
  latest(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.experimental.latest(id);
  }

  /** Explicit admin refresh: always asks the model again and stores a new row. */
  @Post("startups/:id/run")
  run(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.experimental.run(id, { force: true });
  }

  /** Sequential batch over every startup. Safe to repeat: unchanged inputs are not stored twice. */
  @Post("batch")
  batch() {
    return this.experimental.batch();
  }

  /** Compare matured experimental predictions with what actually happened. Never promotes or changes a model. */
  @Post("evaluate")
  evaluate() {
    return this.experimental.evaluateMatured();
  }
}
