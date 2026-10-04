import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MlModel } from "./ml-model.entity";
import { MlModelStatus } from "../common/enums";
import { RegisterMlModelDto } from "./dto/register-ml-model.dto";

/** A model may only ever move forward through this graph — `TEST_ONLY` is
 * terminal (a synthetic model can never become anything else, structurally
 * preventing it from reaching ACTIVE), and every other status can only be
 * reached through the step before it. Mirrors submissions.service.ts's own
 * VALID_TRANSITIONS pattern. */
const VALID_TRANSITIONS: Record<MlModelStatus, MlModelStatus[]> = {
  [MlModelStatus.TEST_ONLY]: [],
  [MlModelStatus.CANDIDATE]: [MlModelStatus.SHADOW, MlModelStatus.REJECTED],
  [MlModelStatus.SHADOW]: [MlModelStatus.ACTIVE, MlModelStatus.RETIRED, MlModelStatus.REJECTED],
  [MlModelStatus.ACTIVE]: [MlModelStatus.RETIRED],
  [MlModelStatus.RETIRED]: [],
  [MlModelStatus.REJECTED]: [],
};

@Injectable()
export class MlModelRegistryService {
  constructor(@InjectRepository(MlModel) private readonly repo: Repository<MlModel>) {}

  list(): Promise<MlModel[]> {
    return this.repo.find({ order: { trainedAt: "DESC" } });
  }

  findByVersion(modelVersion: string): Promise<MlModel | null> {
    return this.repo.findOne({ where: { modelVersion } });
  }

  /** Registers a newly-trained model. Never trusts a caller-supplied
   * status — always CANDIDATE, or TEST_ONLY when the training run itself
   * is flagged synthetic. This is the one place "a new model never starts
   * ACTIVE" is enforced at the write layer, not left to convention. */
  async register(dto: RegisterMlModelDto): Promise<MlModel> {
    const existing = await this.findByVersion(dto.modelVersion);
    if (existing) throw new ConflictException(`Model version "${dto.modelVersion}" is already registered`);
    const status = dto.isTestOnly ? MlModelStatus.TEST_ONLY : MlModelStatus.CANDIDATE;
    const row = this.repo.create({
      modelVersion: dto.modelVersion, targetName: dto.targetName, targetVersion: dto.targetVersion,
      featureSchemaVersion: dto.featureSchemaVersion, algorithm: dto.algorithm,
      hyperparameters: dto.hyperparameters ?? {}, trainingRows: dto.trainingRows, validationRows: dto.validationRows, testRows: dto.testRows,
      trainingPeriodStart: dto.trainingPeriodStart ? new Date(dto.trainingPeriodStart) : undefined,
      trainingPeriodEnd: dto.trainingPeriodEnd ? new Date(dto.trainingPeriodEnd) : undefined,
      metrics: dto.metrics ?? {}, status, artifactLocation: dto.artifactLocation, isTestOnly: !!dto.isTestOnly,
      trainedAt: dto.trainedAt ? new Date(dto.trainedAt) : new Date(),
    });
    return this.repo.save(row);
  }

  async updateStatus(id: string, next: MlModelStatus): Promise<MlModel> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Unknown model ${id}`);
    if (!VALID_TRANSITIONS[row.status].includes(next)) {
      throw new BadRequestException(`Cannot move a model from ${row.status} to ${next}`);
    }
    row.status = next;
    return this.repo.save(row);
  }

  /** Which model versions are currently eligible to receive shadow-
   * prediction traffic — SHADOW and ACTIVE only. Optionally scoped to one
   * target. This is the sole authority MlShadowPredictionService consults;
   * Python's own local copy of a model's status is never trusted for this
   * decision. */
  findEligibleForShadowPrediction(targetName?: string): Promise<MlModel[]> {
    const statuses = [MlModelStatus.SHADOW, MlModelStatus.ACTIVE];
    return this.repo.find({ where: statuses.map((status) => (targetName ? { status, targetName } : { status })) });
  }
}
