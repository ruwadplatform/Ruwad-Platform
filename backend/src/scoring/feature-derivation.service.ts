import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TeamMember } from "../directory-shared/team-member.entity";
import { FundingRound } from "../startups/funding-round.entity";
import { Investment } from "../investments/investment.entity";
import { EntityKind } from "../common/enums";
import type { ScoringFeatures } from "./scoring.types";

/** Aggregates scoring-relevant counts from a startup's own related tables —
 * team_members, funding_rounds, investments — rather than asking founders
 * to re-type numbers the platform already collects elsewhere in the
 * submission form. Kept separate from the engines' own in-calculation
 * derivations (growth rate from two revenue figures, runway from burn/cash
 * — see growth.engine.ts/financial.engine.ts), which stay exactly where
 * they are: this service only ever aggregates rows from other tables, never
 * re-derives a value an engine already computes itself. */
@Injectable()
export class FeatureDerivationService {
  constructor(
    @InjectRepository(TeamMember) private readonly teamMembers: Repository<TeamMember>,
    @InjectRepository(FundingRound) private readonly fundingRounds: Repository<FundingRound>,
    @InjectRepository(Investment) private readonly investments: Repository<Investment>,
  ) {}

  async deriveScoringFeatures(startupId: string): Promise<Partial<ScoringFeatures>> {
    const [team, rounds, investments] = await Promise.all([
      this.teamMembers.find({ where: { entityType: EntityKind.STARTUP, entityId: startupId } }),
      this.fundingRounds.find({ where: { startupId } }),
      this.investments.find({ where: { targetEntityType: EntityKind.STARTUP, targetEntityId: startupId } }),
    ]);

    const out: Partial<ScoringFeatures> = {};
    if (team.length) out.teamSize = team.length;

    const founders = team.filter((t) => t.isFounder);
    if (founders.length) out.founderCount = founders.length;
    if (rounds.length) out.fundingRounds = rounds.length;
    // Money actually reported across the founder's own rounds (SAR, the unit the wizard asks for). Only positive reported amounts count.
    const raised = rounds.map((r) => Number(r.amount)).filter((n) => Number.isFinite(n) && n > 0);
    if (raised.length) out.totalFundingRaised = raised.reduce((a, b) => a + b, 0);

    // Distinct investors: those linked through investments, or named as the lead of a reported round (case-insensitive). A lead named in a
    // round is real evidence of at least that many investors; neither source is ever summed with the other, the larger count wins.
    const investorIds = new Set(investments.map((i) => i.investorId));
    const leads = new Set(rounds.map((r) => (typeof r.lead === "string" ? r.lead.trim().toLowerCase() : "")).filter((l) => l && l !== "n/a" && l !== "undisclosed" && l !== "—"));
    const investors = Math.max(investorIds.size, leads.size);
    if (investors) out.investorCount = investors;

    // Aggregated as the strongest reported value across founders, not a sum
    // or average — one deeply experienced co-founder is real signal even if
    // the others didn't report a figure.
    const experienceYears = founders.map((f) => f.experienceYears).filter((v): v is number => typeof v === "number");
    if (experienceYears.length) out.founderExperienceYears = Math.max(...experienceYears);
    const healthcareYears = founders.map((f) => f.healthcareExperienceYears).filter((v): v is number => typeof v === "number");
    if (healthcareYears.length) out.healthcareExperienceYears = Math.max(...healthcareYears);

    // A reported `false` is real information ("no founder has prior startup
    // experience"), so it's only left out when literally nobody answered.
    const priorExp = founders.map((f) => f.previousStartupExperience).filter((v): v is boolean => typeof v === "boolean");
    if (priorExp.length) out.previousStartupExperience = priorExp.some(Boolean);

    return out;
  }
}
