/** The completion-% header + track/fill bar at the top of the sidebar —
 * extracted verbatim from SubmissionWizard's inline JSX, same .form-progress
 * CSS, no behavior change. */
export function SubmissionProgress({ percent }: { percent: number }) {
  return (
    <div className="form-progress">
      <div className="fp-num">{percent}%</div>
      <div className="fp-label">Complete</div>
      <div className="form-progress-track"><div className="form-progress-fill" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}
