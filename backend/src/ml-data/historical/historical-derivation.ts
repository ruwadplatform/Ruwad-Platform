import { EvidenceStatus } from "../../common/enums";

/** Pure, leakage-safe derivations used by HistoricalSnapshotBuilder. Each one
 * uses only facts that were already true on the snapshot date. */

export interface CareerAnchor { careerStartYear: number; domainStartYear?: number | null; verified: boolean; revokedAt?: Date | null }

export interface DerivedFounderFeatures {
  founderExperienceYears?: number;
  healthcareExperienceYears?: number;
  /** True only if every founder contributing the winning value was verified. */
  verified: boolean;
}

/** founderExperienceYears as of a snapshot = snapshot year minus career start
 * year, taken for the STRONGEST founder (the existing methodology: the
 * maximum across founders, never a sum or average — see
 * scoring/feature-derivation.service.ts). A founder whose career had not
 * started by the snapshot year contributes nothing: a start year after the
 * snapshot would be future information. */
export function deriveFounderFeatures(careers: CareerAnchor[], snapshotDate: string): DerivedFounderFeatures {
  const year = Number(snapshotDate.slice(0, 4));
  const live = careers.filter((c) => !c.revokedAt);
  const exp = live.filter((c) => c.careerStartYear <= year).map((c) => ({ years: year - c.careerStartYear, verified: c.verified }));
  const dom = live.filter((c) => c.domainStartYear != null && (c.domainStartYear as number) <= year).map((c) => ({ years: year - (c.domainStartYear as number), verified: c.verified }));
  const best = (xs: { years: number; verified: boolean }[]) => (xs.length ? xs.reduce((a, b) => (b.years > a.years ? b : a)) : null);
  const e = best(exp);
  const d = best(dom);
  return {
    founderExperienceYears: e?.years,
    healthcareExperienceYears: d?.years,
    verified: !!e && e.verified && (!d || d.verified),
  };
}

export interface FundingEventLike { eventDate: string; valueNumeric?: number | null }

export interface DerivedFundingFeatures { fundingRounds?: number; totalFundingRaised?: number }

/** fundingRounds / totalFundingRaised as of a snapshot, counted from the
 * company's recorded funding events dated on or before it — but ONLY when
 * funding coverage was attested through the snapshot date, i.e. someone
 * checked that the list is complete up to then. Without that, "N rounds on
 * file" is only a lower bound and is not emitted as a feature. */
export function deriveFundingFeatures(events: FundingEventLike[], fundingCoverageThrough: string | undefined, snapshotDate: string): DerivedFundingFeatures {
  if (!fundingCoverageThrough || fundingCoverageThrough < snapshotDate) return {};
  const upTo = events.filter((e) => e.eventDate <= snapshotDate);
  const out: DerivedFundingFeatures = { fundingRounds: upTo.length };
  if (upTo.every((e) => e.valueNumeric != null)) out.totalFundingRaised = upTo.reduce((a, e) => a + (e.valueNumeric as number), 0);
  return out;
}

export interface SeriesRow { effectiveDate: string; valueText?: string | null; status: EvidenceStatus }

/** Customer metrics of different kinds (customers, patients, clinics...) are
 * not one series. The series for a snapshot is defined by the metric type of
 * the EARLIEST usable row on or before the snapshot date; rows of any other
 * type are ignored for that snapshot. (Choosing the type from later rows
 * would let the future decide what the past meant.) */
export function customerSeries<T extends SeriesRow>(rows: T[], snapshotDate: string): T[] {
  const usable = rows.filter((r) => r.effectiveDate <= snapshotDate && r.status !== EvidenceStatus.REJECTED && r.status !== EvidenceStatus.SUPERSEDED);
  if (!usable.length) return rows;
  const earliest = usable.reduce((a, b) => (b.effectiveDate < a.effectiveDate ? b : a));
  const unit = earliest.valueText ?? "UNSPECIFIED";
  return rows.filter((r) => (r.valueText ?? "UNSPECIFIED") === unit);
}
