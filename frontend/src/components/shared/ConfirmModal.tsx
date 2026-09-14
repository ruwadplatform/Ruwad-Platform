"use client";

/** Small styled stand-in for window.confirm() — matches the rest of the
 * app's .modal-box pattern (see ClaimModal, CompareModal, ...) instead of
 * a native browser dialog, which is both visually inconsistent here and
 * blocks automated/embedded browser contexts. */
export function ConfirmModal({ title, body, confirmLabel = "Confirm", danger, onCancel, onConfirm }: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">{title}</h3>
      <p className="muted small mt-8">{body}</p>
      <div className="flex gap-8 mt-16">
        <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
        <button className={`btn ${danger ? "btn-primary" : "btn-primary"}`} style={danger ? { background: "var(--crit)", borderColor: "var(--crit)" } : undefined} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  );
}
