import type { ReactNode } from "react";

/** The one page header: the page title (an <h1>, so every page has exactly one), an optional description, and
 * an optional action on the right (a primary button, a toggle…). Typography and spacing come from `.page-head`
 * in components.css; the row layout from `.page-head-row` in standards.css. Every directory, dashboard,
 * workspace and admin page uses this instead of writing its own header markup. */
export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-head-row">
      <div className="page-head">
        <h1>{title}</h1>
        {description && <p className="muted small">{description}</p>}
      </div>
      {action}
    </div>
  );
}
