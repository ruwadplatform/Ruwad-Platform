"use client";

import { useCallback, useEffect, useState } from "react";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { useStartups } from "@/hooks/use-directory-data";
import {
  fetchStartupOutcomeEvents, createStartupOutcomeEvent, fetchStartupShadowPredictions,
  type OutcomeEvent, type StartupOutcomeEventType, type OutcomeEventSource, type MlPrediction,
} from "@/lib/api/ml-data";
import { ApiError } from "@/lib/api/client";
import { COUNTRIES, MEDICAL_DEVICE_CATEGORIES, THERAPEUTIC_CATEGORIES, REG_MILESTONES_DIGITAL_HEALTH, REG_MILESTONES_MEDICAL_DEVICE, REG_MILESTONES_THERAPEUTIC, STAGES } from "@/data/reference";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");

const EVENT_TYPES: { value: StartupOutcomeEventType; label: string }[] = [
  { value: "FUNDING_ROUND", label: "Funding Round" },
  { value: "REVENUE_UPDATE", label: "Revenue Update" },
  { value: "CUSTOMER_COUNT_UPDATE", label: "Customer Update" },
  { value: "ACTIVE_USERS_UPDATE", label: "Active Users Update" },
  { value: "REGULATORY_MILESTONE", label: "Regulatory Milestone" },
  { value: "REGULATORY_APPROVAL", label: "Regulatory Approval" },
  { value: "COMMERCIAL_LAUNCH", label: "Commercial Launch" },
  { value: "PARTNERSHIP_SIGNED", label: "Partnership Signed" },
  { value: "MARKET_ENTRY", label: "Market Entry" },
  { value: "TEAM_SIZE_UPDATE", label: "Team Size Update" },
  { value: "SHUTDOWN", label: "Shutdown" },
  { value: "ACQUISITION", label: "Acquisition" },
  { value: "IPO", label: "IPO" },
  { value: "OTHER", label: "Other" },
];
const SOURCES: { value: OutcomeEventSource; label: string }[] = [
  { value: "ADMIN_ENTERED", label: "Admin Entered" },
  { value: "FOUNDER_REPORTED", label: "Founder Reported" },
  { value: "VERIFIED_DOCUMENT", label: "Verified Document" },
  { value: "PUBLIC_SOURCE", label: "Public Source" },
];
const NUMERIC_TYPES = new Set<StartupOutcomeEventType>(["FUNDING_ROUND", "REVENUE_UPDATE", "CUSTOMER_COUNT_UPDATE", "ACTIVE_USERS_UPDATE", "TEAM_SIZE_UPDATE"]);
const REGULATORY_TYPES = new Set<StartupOutcomeEventType>(["REGULATORY_MILESTONE", "REGULATORY_APPROVAL"]);

function regulatoryOptions(category: string | undefined): readonly string[] {
  if (!category) return REG_MILESTONES_DIGITAL_HEALTH;
  if (MEDICAL_DEVICE_CATEGORIES.includes(category as (typeof MEDICAL_DEVICE_CATEGORIES)[number])) return REG_MILESTONES_MEDICAL_DEVICE;
  if (THERAPEUTIC_CATEGORIES.includes(category as (typeof THERAPEUTIC_CATEGORIES)[number])) return REG_MILESTONES_THERAPEUTIC;
  return REG_MILESTONES_DIGITAL_HEALTH;
}

export function AdminStartupOutcomesPage({ id }: { id: string }) {
  const { loggedIn, isAdmin, hydrated } = useSession();
  const toast = useToast();
  const { data: startups } = useStartups();
  const startup = startups.find((s) => s.entityId === id);

  const [events, setEvents] = useState<OutcomeEvent[] | null>(null);
  const [predictions, setPredictions] = useState<MlPrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [eventType, setEventType] = useState<StartupOutcomeEventType>("FUNDING_ROUND");
  const [eventDate, setEventDate] = useState("");
  const [valueNumeric, setValueNumeric] = useState("");
  const [valueText, setValueText] = useState("");
  const [source, setSource] = useState<OutcomeEventSource>("ADMIN_ENTERED");
  const [verified, setVerified] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchStartupOutcomeEvents(id).then(setEvents).catch((e) => setError(errText(e)));
    fetchStartupShadowPredictions(id).then(setPredictions).catch(() => setPredictions([]));
  }, [isAdmin, id]);
  useEffect(load, [load]);

  async function submit() {
    if (!eventDate) return;
    setBusy(true);
    try {
      await createStartupOutcomeEvent(id, {
        eventType, eventDate, source, verified,
        valueNumeric: NUMERIC_TYPES.has(eventType) && valueNumeric !== "" ? Number(valueNumeric) : undefined,
        valueText: valueText.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast("Outcome event logged");
      setEventDate(""); setValueNumeric(""); setValueText(""); setSourceUrl(""); setNotes(""); setVerified(false);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  }

  if (!hydrated) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;
  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to log startup outcomes." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;
  if (error) return <div className="mt-20"><EmptyState icon="help" title="Couldn't load outcome events" body={error} /></div>;
  if (!events) return <div className="mt-20"><EmptyState icon="reports" title="Loading…" body="" /></div>;

  return (
    <div>
      <IntelligencePageHeader
        title={startup ? `${startup.name} — Outcome Events` : "Outcome Events"}
        description="Real evidence of what happened to this startup after it was scored — the raw material future ML labels are computed from."
      />

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Log a New Event</h3>
        <div className="grid-2">
          <div className="field">
            <label>Event Type</label>
            <select className="select" value={eventType} onChange={(e) => setEventType(e.target.value as StartupOutcomeEventType)}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Event Date<span className="req">*</span></label>
            <input className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>

          {NUMERIC_TYPES.has(eventType) && (
            <div className="field">
              <label>{eventType === "FUNDING_ROUND" ? "Amount (SAR)" : "Value"}</label>
              <input className="input" type="number" value={valueNumeric} onChange={(e) => setValueNumeric(e.target.value)} />
            </div>
          )}
          {eventType === "FUNDING_ROUND" && (
            <div className="field">
              <label>Round</label>
              <select className="select" value={valueText} onChange={(e) => setValueText(e.target.value)}>
                <option value="">Select…</option>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {REGULATORY_TYPES.has(eventType) && (
            <div className="field">
              <label>Milestone</label>
              <select className="select" value={valueText} onChange={(e) => setValueText(e.target.value)}>
                <option value="">Select…</option>
                {regulatoryOptions(startup?.category).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          {eventType === "MARKET_ENTRY" && (
            <div className="field">
              <label>Country</label>
              <select className="select" value={valueText} onChange={(e) => setValueText(e.target.value)}>
                <option value="">Select…</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {eventType === "PARTNERSHIP_SIGNED" && (
            <div className="field">
              <label>Partner Name</label>
              <input className="input" value={valueText} onChange={(e) => setValueText(e.target.value)} />
            </div>
          )}
          {["SHUTDOWN", "ACQUISITION", "IPO", "OTHER"].includes(eventType) && (
            <div className="field">
              <label>Detail</label>
              <input className="input" value={valueText} onChange={(e) => setValueText(e.target.value)} placeholder="e.g. acquirer name" />
            </div>
          )}

          <div className="field">
            <label>Source</label>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value as OutcomeEventSource)}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Verified</label>
            <button type="button" className={`toggle${verified ? " on" : ""}`} aria-pressed={verified} onClick={() => setVerified((v) => !v)} />
          </div>
          <div className="field">
            <label>Source URL</label>
            <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="field field-full">
            <label>Notes</label>
            <textarea className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm mt-12" disabled={busy || !eventDate} onClick={submit}>Log Event</button>
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Event History</h3>
        {events.length === 0 ? (
          <p className="small muted">No outcome events logged for this startup yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Value</th><th>Source</th><th>Verified</th><th>Notes</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="small">{e.eventDate}</td>
                    <td className="small">{e.eventType}</td>
                    <td className="small">{e.valueNumeric != null ? e.valueNumeric.toLocaleString() : ""}{e.valueText ? (e.valueNumeric != null ? ` — ${e.valueText}` : e.valueText) : ""}</td>
                    <td><span className={`badge ${e.source === "SYSTEM_DERIVED" ? "badge-neutral" : "badge-good"}`}>{e.source.replace(/_/g, " ")}</span></td>
                    <td className="small">{e.verified ? "Yes" : "No"}</td>
                    <td className="small">{e.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel panel-pad mt-16">
        <h3 className="fs-13 mb-12">Shadow Predictions</h3>
        <p className="small muted mb-12">Internal-only model predictions for this startup — never shown publicly and never part of the RUWĀD Score above. See <span style={{ fontFamily: "monospace" }}>/admin/ml-models</span> for the models generating these.</p>
        {predictions === null ? (
          <p className="small muted">Loading…</p>
        ) : predictions.length === 0 ? (
          <p className="small muted">No shadow predictions yet — this startup has no snapshot scored against a SHADOW/ACTIVE model.</p>
        ) : (
          <div className="scroll-x">
            <table className="data-table">
              <thead><tr><th>Target</th><th>Model</th><th>Prediction</th><th>Model Status</th><th>Predicted</th><th>Actual Outcome</th></tr></thead>
              <tbody>
                {predictions.map((p) => (
                  <tr key={p.id}>
                    <td className="small">{p.targetName}</td>
                    <td className="small" style={{ fontFamily: "monospace" }}>{p.modelVersion}</td>
                    <td className="small">{p.predictionType === "PROBABILITY" ? `${(p.prediction * 100).toFixed(1)}%` : p.prediction.toFixed(2)}</td>
                    <td><span className={`badge ${p.modelStatus === "ACTIVE" ? "badge-good" : p.modelStatus === "SHADOW" ? "badge-warn" : "badge-neutral"}`}>{p.modelStatus}</span></td>
                    <td className="small">{new Date(p.predictedAt).toLocaleDateString()}</td>
                    <td className="small">{p.actualOutcome != null ? p.actualOutcome : p.evaluatedAt ? "—" : "Not yet matured"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
