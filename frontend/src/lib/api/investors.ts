import { api, isNotFound } from "./client";
import { logoUrl } from "./uploads";
import type { Investor } from "@/types/entities";

interface RawPortfolioStartup {
  id: string; slug: string; name: string; logo: string; logoImageId?: string | null; category: string; city: string; tagline: string; stage: string; score: number;
  round?: string | null; year?: number | null;
}

interface RawInvestor {
  id: string; slug: string; name: string; short: string; type: string; city: string; founded: number;
  desc: string; thesis: string; stageFocus?: string[]; hcFocus?: string[]; ticket: string; aum: string; available: string;
  investments: number; exits: number; hcDeals: number;
  logo?: string; logoImageId?: string | null; sectors?: string[]; team?: { name: string; title: string }[];
  portfolio?: RawPortfolioStartup[]; portfolioSize?: number;
  openOpps?: string[]; recentDeals?: Investor["recentDeals"]; news?: Investor["news"];
  provenanceConfidence?: Investor["provenance"]["confidence"]; provenanceLastUpdated: string; provenanceSources?: string[];
}

function mapInvestor(r: RawInvestor): Investor {
  const portfolio = r.portfolio ?? [];
  return {
    id: r.slug,
    entityId: r.id,
    name: r.name,
    short: r.short,
    type: r.type,
    city: r.city,
    founded: r.founded,
    desc: r.desc,
    thesis: r.thesis,
    stageFocus: r.stageFocus ?? [],
    hcFocus: r.hcFocus ?? r.sectors ?? [],
    ticket: r.ticket,
    aum: r.aum,
    available: r.available,
    investments: r.investments,
    exits: r.exits,
    hcDeals: r.hcDeals,
    portfolio: portfolio.length ? portfolio.map((p) => p.name) : new Array(r.portfolioSize ?? 0).fill(""),
    portfolioDetailed: portfolio.map((p) => ({ ...p, logoUrl: logoUrl(p.logoImageId) })),
    logo: r.logo ?? r.name.slice(0, 2).toUpperCase(),
    logoUrl: logoUrl(r.logoImageId),
    team: (r.team ?? []).map((t) => ({ name: t.name, title: t.title })),
    openOpps: r.openOpps ?? [],
    recentDeals: r.recentDeals ?? [],
    news: r.news ?? [],
    provenance: { lastUpdated: r.provenanceLastUpdated, sources: r.provenanceSources ?? [], confidence: r.provenanceConfidence ?? "Medium" },
  };
}

export async function fetchInvestors(): Promise<Investor[]> {
  const res = await api.get<{ items: RawInvestor[] }>("/investors?limit=100");
  return res.items.map(mapInvestor);
}

export async function fetchInvestorBySlug(slug: string): Promise<Investor | null> {
  try {
    const raw = await api.get<RawInvestor>(`/investors/${slug}`);
    return mapInvestor(raw);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
