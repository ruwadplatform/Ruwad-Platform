import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Investment } from "./investment.entity";
import { EntityKind } from "../common/enums";

@Injectable()
export class InvestmentsService {
  constructor(@InjectRepository(Investment) private readonly repo: Repository<Investment>) {}

  async setForInvestor(investorId: string, items: { targetEntityType: EntityKind; targetEntityId: string; round?: string; year?: number }[]): Promise<void> {
    await this.repo.delete({ investorId });
    if (items.length) await this.repo.save(this.repo.create(items.map((i) => ({ investorId, ...i }))));
  }

  findForInvestor(investorId: string): Promise<Investment[]> {
    return this.repo.find({ where: { investorId }, order: { year: "DESC" } });
  }

  findForTarget(targetEntityType: EntityKind, targetEntityId: string): Promise<Investment[]> {
    return this.repo.find({ where: { targetEntityType, targetEntityId } });
  }

  countPortfolioSize(investorIds: string[]): Promise<Investment[]> {
    return this.repo.find({ where: { investorId: In(investorIds) } });
  }
}
