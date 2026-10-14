"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";
import { requireAuth } from "@/lib/store";
import { AISummaryPanel, type AISummaryEntity } from "./AISummaryPanel";

/** "AI Summary" button for a directory row or card. Opens the summary slide-over in place — it never navigates away from the list.
 * Guests are sent to log in first, exactly like the bookmark star. Desktop shows icon + label; narrow screens show the icon only
 * (the label is visually hidden, and `title`/`aria-label` keep it accessible). */
export function AISummaryButton({ entity, compact = false }: { entity: AISummaryEntity; /** icon-only (grid cards) */ compact?: boolean }) {
  const { openDrawer } = useFilterDrawer();
  return (
    <button
      type="button"
      className={`ai-summary-btn${compact ? " ai-summary-btn--icon" : ""}`}
      title="AI Summary"
      aria-label={`AI Summary for ${entity.name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!requireAuth("route", { label: "ai-summary" })) return;
        openDrawer(<AISummaryPanel entity={entity} />);
      }}
    >
      <RuwadIcon name="sparkle" size={14} />
      <span className="ai-summary-label">AI Summary</span>
    </button>
  );
}
