"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import {
  fetchAdminScore, fetchAdminScoringFeatures, setAdminScoringFeatures, verifyAdminScoringFeatures, recalculateAdminScore,
  type AdminScoreResult, type AdminScoringFeatures, type ScoreDataSource,
} from "@/lib/api/scoring";
import { ApiError } from "@/lib/api/client";
import { REG_MILESTONES_DIGITAL_HEALTH, REG_MILESTONES_MEDICAL_DEVICE, REG_MILESTONES_THERAPEUTIC, MEDICAL_DEVICE_CATEGORIES, THERAPEUTIC_CATEGORIES, TRL_LABELS } from "@/data/reference";
import type { ScoreFactorKey } from "@/types/entities";
import { ExperimentalMlPanel } from "./ExperimentalMlPanel";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  growth: "Growth Momentum", financial: "Financial Strength", market: "Market Potential",
  team: "Team Strength", regulatory: "Regulatory Readiness", technology: "Technology Differentiation",
};

type FieldKind = "number" | "boolean" | "select";
interface EditableField { key: string; label: string; kind: FieldKind; options?: readonly string[] }

function regulatoryMilestoneOptions(category: string | undefined): readonly string[] {
  if (!category) return REG_MILESTONES_DIGITAL_HEALTH;
  if (MEDICAL_DEVICE_CATEGORIES.includes(category as (typeof MEDICAL_DEVICE_CATEGORIES)[number])) return REG_MILESTONES_MEDICAL_DEVICE;
  if (THERAPEUTIC_CATEGORIES.includes(category as (typeof THERAPEUTIC_CATEGORIES)[number])) return REG_MILESTONES_THERAPEUTIC;
  return REG_MILESTONES_DIGITAL_HEALTH;
}

function fieldsByFactor(category: string | undefined): Record<ScoreFactorKey, EditableField[]> {
  return {
    growth: [
      { key: "annualRevenue", label: "Annual Revenue (SAR)", kind: "number" }, { key: "previousAnnualRevenue", label: "Previous Year Revenue (SAR)", kind: "number" },
      { key: "quarterlyRevenueGrowth", label: "Quarterly Revenue Growth (%)", kind: "number" }, { key: "customerCount", label: "Customer Count", kind: "number" },
      { key: "previousCustomerCount", label: "Previous Customer Count", kind: "number" }, { key: "customerGrowthRate", label: "Customer Growth Rate (%)", kind: "number" },
      { key: "partnershipsCount", label: "Partnerships Count", kind: "number" }, { key: "partnershipGrowth", label: "Partnership Growth (%)", kind: "number" },
      { key: "geographicExpansion", label: "Markets Count", kind: "number" }, { key: "activeUsers", label: "Active Users", kind: "number" }, { key: "userGrowthRate", label: "User Growth Rate (%)", kind: "number" },
    ],
    financial: [
      { key: "monthlyBurn", label: "Monthly Burn (SAR)", kind: "number" }, { key: "cashAvailable", label: "Cash Available (SAR)", kind: "number" },
      { key: "runwayMonths", label: "Runway (months)", kind: "number" }, { key: "recurringRevenue", label: "Recurring Revenue (SAR)", kind: "number" },
      { key: "totalFundingRaised", label: "Total Funding Raised (SAR)", kind: "number" }, { key: "fundingRounds", label: "Funding Rounds", kind: "number" },
      { key: "investorCount", label: "Investor Count", kind: "number" }, { key: "grossMargin", label: "Gross Margin (%)", kind: "number" }, { key: "burnMultiple", label: "Burn Multiple", kind: "number" },
    ],
    market: [
      { key: "tam", label: "TAM (USD)", kind: "number" }, { key: "sam", label: "SAM (USD)", kind: "number" }, { key: "som", label: "SOM (USD)", kind: "number" },
      { key: "marketGrowthRate", label: "Market Growth Rate (%)", kind: "number" }, { key: "competitionLevel", label: "Competition Level (0-10)", kind: "number" },
      { key: "saudiMarketOpportunity", label: "Saudi Market Opportunity (0-10)", kind: "number" }, { key: "menaMarketOpportunity", label: "MENA Market Opportunity (0-10)", kind: "number" },
      { key: "categoryTailwinds", label: "Category Tailwinds (0-10)", kind: "number" },
    ],
    team: [
      { key: "founderCount", label: "Founder Count", kind: "number" }, { key: "founderExperienceYears", label: "Founder Experience (years)", kind: "number" },
      { key: "healthcareExperienceYears", label: "Healthcare Experience (years)", kind: "number" }, { key: "technicalExperienceYears", label: "Technical Experience (years)", kind: "number" },
      { key: "commercialExperienceYears", label: "Commercial Experience (years)", kind: "number" }, { key: "previousStartupExperience", label: "Prior Startup Experience", kind: "boolean" },
      { key: "previousExits", label: "Previous Exits", kind: "number" }, { key: "teamSize", label: "Team Size", kind: "number" },
      { key: "leadershipCompleteness", label: "Leadership Completeness (0-10)", kind: "number" }, { key: "technicalTeamStrength", label: "Technical Team Strength (0-10)", kind: "number" },
      { key: "commercialTeamStrength", label: "Commercial Team Strength (0-10)", kind: "number" },
    ],
    regulatory: [
      { key: "regulatoryMilestone", label: "Regulatory Milestone", kind: "select", options: regulatoryMilestoneOptions(category) },
    ],
    technology: [
      { key: "patentsGranted", label: "Patents Granted", kind: "number" }, { key: "patentsPending", label: "Patents Pending", kind: "number" },
      { key: "proprietaryDatasets", label: "Proprietary Datasets", kind: "number" }, { key: "proprietaryAlgorithms", label: "Proprietary Algorithms", kind: "number" },
      { key: "proprietaryTechnology", label: "Proprietary Technology", kind: "boolean" }, { key: "peerReviewedPublications", label: "Peer-Reviewed Publications", kind: "number" },
      { key: "technologyReadinessLevel", label: "Technology Readiness Level", kind: "select", options: TRL_LABELS },
      { key: "technicalComplexity", label: "Technical Complexity (0-10)", kind: "number" }, { key: "replicationDifficulty", label: "Replication Difficulty (0-10)", kind: "number" },
      { key: "clinicalValidation", label: "Clinical Validation Completed", kind: "boolean" },
    ],
  };
}

const SOURCE_BADGE: Record<ScoreDataSource, { cls: string; label: string }> = {
  VERIFIED_DOCUMENT: { cls: "badge-good", label: "Verified" },
  ADMIN_ENTERED: { cls: "badge-good", label: "Admin Entered" },
  FOUNDER_SUBMITTED: { cls: "badge-neutral", label: "Founder Submitted" },
  PITCH_DECK_EXTRACTED: { cls: "badge-warn", label: "AI Extracted" },
  EXTERNAL_SOURCE: { cls: "badge-neutral", label: "External Source" },
  SYSTEM_DERIVED: { cls: "badge-neutral", label: "System Derived" },
};

function scoreBadgeClass(status: string): string {
  if (status === "CALCULATED") return "badge-good";
  if (status === "STALE") return "badge-warn";
  if (status === "ERROR") return "badge-crit";
  return "badge-neutral";
}

/** Technology Readiness Level is stored as its numeric 1-9 level (see
 * backend/src/scoring/trl-labels.ts); this converts a chosen friendly label
 * back to that number, exactly like the founder-facing wizard's publisher
 * does — duplicated here as a plain lookup since it's the same 9-item
 * vocabulary, not a scoring rule. */
function trlLevelForLabel(label: string): number | undefined {
  const i = TRL_LABELS.indexOf(label as (typeof TRL_LABELS)[number]);
  return i >= 0 ? i + 1 : undefined;
}
function trlLabelForLevel(level: unknown): string {
  const n = typeof level === "number" ? level : undefined;
  return n && n >= 1 && n <= TRL_LABELS.length ? TRL_LABELS[n - 1] : "";
}

export function AdminStartupScoringPage({ id }: { id: string }) {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { data: startups } = useStartups();
  const startup = startups.find((s) => s.entityId === id);

  const [score, setScore] = useState<AdminScoreResult | null>(null);
  const [features, setFeatures] = useState<AdminScoringFeatures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    if (!isAdmin) return;
    Promise.all([fetchAdminScore(id), fetchAdminScoringFeatures(id)])
      .then(([s, f]) => { setScore(s); setFeatures(f); })
      .catch((e) => setError(errText(e)));
  }, [isAdmin, id]);
  useEffect(load, [load]);

  async function recalculate() {
    setBusy(true);
    try { await recalculateAdminScore(id); toast("Score recalculated"); load(); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function verify(key: string) {
    setBusy(true);
    try { await verifyAdminScoringFeatures(id, [key]); toast(`Marked "${key}" as verified`); load(); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  async function saveEdits() {
    if (!Object.keys(patch).length || !reason.trim()) return;
    setBusy(true);
    try {
      await setAdminScoringFeatures(id, patch, "ADMIN_ENTERED", reason.trim());
      toast("Scoring inputs updated");
      setPatch({});
      setReason("");
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to manage RUWĀD Score data." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load scoring data" body={error} /></div>;
  if (!score || !features) return <div className="mt-20"><EmptyState icon="reports" title="Loading scoring data…" body="" /></div>;

  const groups = fieldsByFactor(startup?.category);

  return (
    <div>
      <IntelligencePageHeader
        title={startup ? `${startup.name} — RUWĀD Score` : "RUWĀD Score"}
        description={startup ? `${startup.category} · Reference ${id.slice(0, 8).toUpperCase()}` : `Reference ${id.slice(0, 8).toUpperCase()}`}
        action={(
          <div className="flex gap-8">
            <Link className="btn btn-outline btn-sm" href={`/admin/startups/${id}/outcomes`}>Outcome Events</Link>
            <button className="btn btn-outline btn-sm" disabled={busy} onClick={recalculate}>Recalculate</button>
          </div>
        )}
      />

      <div className="panel panel-pad mt-16">
        <div className="flex gap-16" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className="stat-mini"><div className="sm-label">Score</div><div className="sm-val fs-15">{score.ruwadScore != null ? score.ruwadScore.toFixed(1) : "—"} / 10</div></div>
          <div className="stat-mini"><div className="sm-label">Status</div><span className={`badge ${scoreBadgeClass(score.status)}`}>{score.status.replace(/_/g, " ")}</span></div>
          <div className="stat-mini"><div className="sm-label">Confidence</div><div className="sm-val fs-15">{score.confidenceScore != null ? `${Math.round(score.confidenceScore * 100)}%` : "—"}</div></div>
          <div className="stat-mini"><div className="sm-label">Version</div><div className="sm-val fs-15">{score.version}</div></div>
          <div className="stat-mini"><div className="sm-label">Calculated</div><div className="sm-val fs-15">{new Date(score.calculatedAt).toLocaleString()}</div></div>
        </div>
      </div>

      <ExperimentalMlPanel startupId={id} />

      <div className="mt-16" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {(Object.keys(FACTOR_LABELS) as ScoreFactorKey[]).map((key) => {
          const f = score.factors[key];
          return (
            <div className="panel panel-pad" key={key}>
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <h3 className="fs-13">{FACTOR_LABELS[key]}</h3>
                <span className="mono small">{f.score != null ? f.score.toFixed(1) : "—"} / 10</span>
              </div>
              <p className="small muted mt-8">{f.reason}</p>
              {f.inputsUsed.length > 0 && <p className="fs-11 muted mt-4">Used: {f.inputsUsed.join(", ")}</p>}
              {f.missingInputs.length > 0 && <p className="fs-11 muted mt-4">Missing: {f.missingInputs.join(", ")}</p>}
            </div>
          );
        })}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Feature Values &amp; Provenance</h3>
        {Object.keys(features.features).length === 0 ? (
          <p className="small muted">No structured scoring inputs reported for this startup yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Key</th><th>Value</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {Object.entries(features.features).map(([key, value]) => {
                  const prov = features.provenance[key];
                  const badge = prov ? SOURCE_BADGE[prov.source] : undefined;
                  const display = key === "technologyReadinessLevel" ? trlLabelForLevel(value) || String(value) : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
                  return (
                    <tr key={key}>
                      <td className="small">{key}</td>
                      <td className="small">{display}</td>
                      <td>{badge ? <span className={`badge ${badge.cls}`}>{badge.label}</span> : "—"}{prov?.verified && <span className="fs-11 muted"> · verified</span>}</td>
                      <td>
                        {!prov?.verified && (
                          <button className="btn btn-outline btn-xs" disabled={busy} onClick={() => verify(key)}>Verify</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Edit Scoring Inputs</h3>
        <p className="small muted mb-12">Every change is audited with a reason and never silently overwrites a value a founder or a verified document already reported at equal or higher confidence — an admin edit always applies.</p>
        {(Object.keys(FACTOR_LABELS) as ScoreFactorKey[]).map((factorKey) => (
          <div key={factorKey} className="mt-16">
            <h4 className="fs-12 muted">{FACTOR_LABELS[factorKey]}</h4>
            <div className="grid-2">
              {groups[factorKey].map((f) => {
                const current = f.key in patch ? patch[f.key] : features.features[f.key];
                if (f.kind === "boolean") {
                  const on = !!current;
                  return (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      <button type="button" className={`toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => setPatch((p) => ({ ...p, [f.key]: !on }))} />
                    </div>
                  );
                }
                if (f.kind === "select") {
                  const value = f.key === "technologyReadinessLevel" ? trlLabelForLevel(current) : (typeof current === "string" ? current : "");
                  return (
                    <div className="field" key={f.key}>
                      <label>{f.label}</label>
                      <select
                        className="select"
                        value={value}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) return;
                          setPatch((p) => ({ ...p, [f.key]: f.key === "technologyReadinessLevel" ? trlLevelForLabel(v) : v }));
                        }}
                      >
                        <option value="">Select…</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                }
                return (
                  <div className="field" key={f.key}>
                    <label>{f.label}</label>
                    <input
                      type="number" className="input"
                      value={current === undefined || current === null || current === "" ? "" : String(current)}
                      onChange={(e) => setPatch((p) => ({ ...p, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="field mt-16">
          <label>Reason for this change<span className="req">*</span></label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corrected from verified cap table" />
        </div>
        <button className="btn btn-primary btn-sm mt-8" disabled={busy || !Object.keys(patch).length || !reason.trim()} onClick={saveEdits}>Save Changes</button>
      </div>
    </div>
  );
}
