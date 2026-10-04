import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { MlModelRegistryService } from "./ml-model-registry.service";
import { MlTrainingRunService } from "./ml-training-run.service";
import { MlShadowPredictionService } from "./ml-shadow-prediction.service";
import { RegisterMlModelDto } from "./dto/register-ml-model.dto";
import { UpdateMlModelStatusDto } from "./dto/update-ml-model-status.dto";
import { RecordTrainingRunDto } from "./dto/record-training-run.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UserRole } from "../common/enums";

/** Admin-only (same JWT Bearer/cookie auth every other admin route uses —
 * the Python training CLI authenticates exactly like a human admin would,
 * by logging in and reusing the token; see ml/app/ruwad_client.py). Never
 * exposed publicly: model metadata, hyperparameters and metrics are
 * internal tooling output, not something a founder or investor sees. */
@ApiTags("ml-data")
@ApiCookieAuth()
@Controller("ml-data")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN)
export class MlModelsController {
  constructor(
    private readonly registry: MlModelRegistryService,
    private readonly runs: MlTrainingRunService,
    private readonly shadow: MlShadowPredictionService,
  ) {}

  @Get("models")
  listModels() {
    return this.registry.list();
  }

  /** Called by the Python training CLI after a run completes. */
  @Post("models")
  registerModel(@Body() dto: RegisterMlModelDto) {
    return this.registry.register(dto);
  }

  @Patch("models/:id/status")
  updateModelStatus(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateMlModelStatusDto) {
    return this.registry.updateStatus(id, dto.status);
  }

  @Get("training-runs")
  listTrainingRuns() {
    return this.runs.list();
  }

  /** Called by the Python training CLI — every attempt, including one the
   * readiness gate blocked before training started. */
  @Post("training-runs")
  recordTrainingRun(@Body() dto: RecordTrainingRunDto) {
    return this.runs.record(dto);
  }

  @Get("predictions")
  listPredictions(@Query("startupId", new ParseUUIDPipe()) startupId: string) {
    return this.shadow.listForStartup(startupId);
  }

  /** Admin-triggered only — never an automatic cron (see docs/
   * ml-training-methodology.md). */
  @Post("predictions/evaluate")
  evaluatePredictions() {
    return this.shadow.evaluateMaturedPredictions();
  }
}
