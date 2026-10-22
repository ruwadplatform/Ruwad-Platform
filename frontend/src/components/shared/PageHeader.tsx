import type { ReactNode } from "react";

/** The one page header: the page title (an <h1>, so every page has exactly one) with an optional description,
 * styled by `.page-head` in components.css.
 *
 * `variant="row"` (default) lays the title block and an optional action side by side — the layout every page that
 * used IntelligencePageHeader already had. `variant="block"` is just the title block on its own, for the directory
 * and tool pages that wrote `.page-head` by hand; its spacing collapses with the next section exactly as before. */
export function PageHeader({ title, description, action, variant = "row", className }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: "row" | "block";
  className?: string;
}) {
  const head = (
    <div className={`page-head${className ? ` ${className}` : ""}`}>
      <h1>{title}</h1>
      {description && <p className="muted small">{description}</p>}
    </div>
  );
  if (variant === "block") return head;
  return (
    <div className="page-head-row">
      {head}
      {action}
    </div>
  );
}
