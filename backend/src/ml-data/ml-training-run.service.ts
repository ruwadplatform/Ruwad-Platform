import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MlTrainingRun } from "./ml-training-run.entity";
import { RecordTrainingRunDto } from "./dto/record-training-run.dto";

/** Append-only training-run audit trail, reported by the Python CLI. */
@Injectable()
export class MlTrainingRunService {
  constructor(@InjectRepository(MlTrainingRun) private readonly repo: Repository<MlTrainingRun>) {}

  list(): Promise<MlTrainingRun[]> {
    return this.repo.find({ order: { startedAt: "DESC" } });
  }

  record(dto: RecordTrainingRunDto): Promise<MlTrainingRun> {
    const row = this.repo.create({
      targetName: dto.targetName, targetVersion: dto.targetVersion, featureSchemaVersion: dto.featureSchemaVersion, algorithm: dto.algorithm,
      status: dto.status, startedAt: new Date(dto.startedAt), completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      datasetRows: dto.datasetRows, metrics: dto.metrics ?? {}, hyperparameters: dto.hyperparameters ?? {},
      modelVersion: dto.modelVersion, artifactLocation: dto.artifactLocation, errorMessage: dto.errorMessage,
      createdBy: dto.createdBy, isTestOnly: !!dto.isTestOnly,
    });
    return this.repo.save(row);
  }
}
