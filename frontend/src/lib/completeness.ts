import type { Startup } from "@/types/entities";
import type { CompletenessCheck } from "@/components/workspace/ProfileCompleteness";
import type { ResolvedEntity, ResolvableKind } from "@/lib/entity-resolve";

/** Derives profile completeness from the fields the record actually has —
 * never a hand-typed score. Startups get the detailed checklist the Phase
 * 4 spec calls out explicitly (logo/description/website/founding year/
 * headquarters/sector/stage/funding/founders/product/market/pitch deck);
 * other entity kinds get a simpler, generically-applicable check since
 * their public directory records don't carry an equivalent submission
 * shape (Investor/Hub/Research/Multinational profiles are curated data,
 * not self-reported drafts). */
export function startupCompleteness(s: Startup): CompletenessCheck[] {
  return [
    { label: "Logo", ok: !!s.logo },
    { label: "Description", ok: !!s.desc && s.desc.length > 20 },
    { label: "Website", ok: !!s.website },
    { label: "Founding Year", ok: !!s.founded },
    { label: "Headquarters", ok: !!s.hq },
    { label: "Sector", ok: !!s.category },
    { label: "Stage", ok: !!s.stage },
    { label: "Funding Information", ok: s.rounds.length > 0 && s.fundingTotal > 0 },
    { label: "Founders", ok: s.team.some((t) => t.founder) },
    { label: "Product Details", ok: !!s.problem && !!s.solution && !!s.advantage },
    { label: "Market Information", ok: !!s.market.tam && s.market.competitors.length > 0 },
    { label: "Pitch Deck", ok: !!s.documents.find((d) => d.n === "Pitch Deck")?.ok },
  ];
}

export function genericCompleteness(e: ResolvedEntity): CompletenessCheck[] {
  return [
    { label: "Logo", ok: !!e.logo },
    { label: "Description", ok: !!e.desc && e.desc.length > 10 },
    { label: "City", ok: !!e.subtitle },
    { label: "Sector / Focus", ok: !!e.sector },
    { label: "Profile Link", ok: !!e.href },
  ];
}

export function completenessFor(kind: ResolvableKind, entity: ResolvedEntity): CompletenessCheck[] {
  if (kind === "startups") return startupCompleteness(entity.record as Startup);
  return genericCompleteness(entity);
}

export function completenessPercent(checks: CompletenessCheck[]): number {
  return Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);
}
