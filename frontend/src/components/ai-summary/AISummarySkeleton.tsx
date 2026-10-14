/** Placeholder lines shown while a summary is being generated or fetched (same pulse as the rest of the app's `.skel`). */
export function AISummarySkeleton() {
  return (
    <div className="ai-skeleton" role="status" aria-live="polite" aria-label="Generating summary">
      <span className="skel" style={{ width: "100%" }} />
      <span className="skel" style={{ width: "96%" }} />
      <span className="skel" style={{ width: "100%" }} />
      <span className="skel" style={{ width: "88%" }} />
      <span className="skel" style={{ width: "62%" }} />
      <div className="ai-skeleton-points">
        <span className="skel" style={{ width: "82%" }} />
        <span className="skel" style={{ width: "74%" }} />
      </div>
      <p className="small muted">Generating a summary from the profile data…</p>
    </div>
  );
}
