"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { OrganizationLogo } from "@/components/shared/OrganizationLogo";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useAISummary } from "@/hooks/use-ai-summary";
import { AISummarySkeleton } from "./AISummarySkeleton";
import type { AiSummaryEntityType, AiSummaryReady } from "@/lib/api/ai-summaries";

/** What the panel needs to show the organization before (and while) the summary loads — taken from the directory row that was clicked. */
export interface AISummaryEntity {
  type: AiSummaryEntityType;
  /** The directory id (slug), used for the API call and the profile link. */
  id: string;
  name: string;
  logo: string;
  logoUrl?: string | null;
  sector: string;
  headquarters: string;
}

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function plainText(entity: AISummaryEntity, d: AiSummaryReady): string {
  return [
    `${entity.name} — AI summary`,
    "",
    d.overview,
    "",
    ...d.highlights.map((h) => `• ${h}`),
    "",
    `AI-generated from ${d.source.label}${d.source.lastUpdated ? ` (profile updated ${d.source.lastUpdated})` : ""}. Verify before relying on it.`,
  ].join("\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts: fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

const profileHref = (e: AISummaryEntity) => `/${e.type}/${e.id}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Right-hand slide-over opened from a directory row/card. Rendered inside the app's shared drawer (overlay, click-outside-to-close). */
export function AISummaryPanel({ entity }: { entity: AISummaryEntity }) {
  const { closeDrawer } = useFilterDrawer();
  const toast = useToast();
  const router = useRouter();
  const state = useAISummary(entity.type, entity.id);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus into the panel, trap Tab inside it, close on Escape, and hand focus back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") { ev.preventDefault(); closeDrawer(); return; }
      if (ev.key !== "Tab" || !rootRef.current) return;
      const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      else if (!rootRef.current.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus?.(); };
  }, [closeDrawer]);

  async function copy() {
    if (state.phase !== "ready") return;
    toast((await copyToClipboard(plainText(entity, state.data))) ? "Summary copied" : "Couldn't copy — select the text and copy it manually");
  }

  function viewProfile() {
    closeDrawer();
    router.push(profileHref(entity));
  }

  return (
    <div className="ai-panel" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby="ai-panel-title">
      <div className="ai-panel-head">
        <h3 id="ai-panel-title"><RuwadIcon name="sparkle" size={16} className="ai-ico" /> AI Company Summary</h3>
        <button ref={closeRef} className="icon-btn" onClick={closeDrawer} aria-label="Close AI summary"><RuwadIcon name="x" size={16} /></button>
      </div>

      <div className="ai-panel-org">
        <OrganizationLogo logo={entity.logo} logoUrl={entity.logoUrl} className="row-logo" />
        <div>
          <div className="ai-org-name">{entity.name}</div>
          <div className="small muted">{[entity.sector, entity.headquarters].filter(Boolean).join(" · ")}</div>
        </div>
      </div>

      <div className="ai-panel-body" aria-live="polite">
        {state.phase === "loading" && <AISummarySkeleton />}

        {state.phase === "error" && (
          <div className="ai-state" role="alert">
            <RuwadIcon name="help" size={26} />
            <h4>Summary unavailable</h4>
            <p>{state.message}</p>
            <button className="btn btn-outline btn-sm" onClick={state.retry}>Retry</button>
          </div>
        )}

        {state.phase === "unavailable" && (
          <div className="ai-state">
            <RuwadIcon name="doc" size={26} />
            <h4>{state.reason === "insufficient_data" ? "Not enough information yet" : "AI summaries are not available right now"}</h4>
            <p>
              {state.reason === "insufficient_data"
                ? "This profile doesn't have enough published detail to write a reliable summary. It will be available once more information is added."
                : "The AI service isn't configured for this environment. Please try again later."}
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <>
            <span className="ai-badge"><RuwadIcon name="sparkle" size={11} /> AI-generated</span>
            <p className="ai-overview">{state.data.overview}</p>
            <h4 className="ai-sub">Key highlights</h4>
            <ul className="ai-highlights">{state.data.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
            <div className="ai-source small muted">
              <div>
                Source: {state.data.source.label}
                {state.data.source.sources.length > 0 && ` (${state.data.source.sources.join(", ")})`}
                {state.data.source.confidence && ` · ${state.data.source.confidence} confidence`}
              </div>
              <div>
                {state.data.source.lastUpdated && `Profile updated ${fmtDate(state.data.source.lastUpdated)} · `}
                Generated {fmtDate(state.data.generatedAt)}
              </div>
              <div>AI-written from the profile data only. Verify important details before relying on them.</div>
            </div>
          </>
        )}
      </div>

      <div className="ai-panel-foot">
        <button className="btn btn-outline" onClick={copy} disabled={state.phase !== "ready"}><RuwadIcon name="doc" size={14} /> Copy Summary</button>
        <button className="btn btn-primary" onClick={viewProfile}>View Full Profile</button>
      </div>
    </div>
  );
}
