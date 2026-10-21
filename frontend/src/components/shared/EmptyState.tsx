import type { ReactNode } from "react";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";

/** The three states a list or page can be in instead of content — nothing to show, loading, or failed — share
 * one shape (`.empty-state`: icon, title, optional line of text, optional action) so every page looks the
 * same in each of them. Use these instead of writing the markup inline. */
export function EmptyState({ icon, title, body, action }: { icon: RuwadIconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <RuwadIcon name={icon} size={30} />
      <h4>{title}</h4>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

/** Content is on its way. Announced to screen readers as a polite status. */
export function LoadingState({ title = "Loading…", body }: { title?: string; body?: string }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="state-spinner" aria-hidden="true" />
      <h4>{title}</h4>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

/** Something failed. `body` is the reason, `action` an optional retry button. */
export function ErrorState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state is-error" role="alert">
      <RuwadIcon name="help" size={30} />
      <h4>{title}</h4>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}
