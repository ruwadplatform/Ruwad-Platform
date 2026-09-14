import type { ReactNode } from "react";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";

/** The `.empty-state` markup already repeated inline across every directory
 * page (Startups/Investors/Hubs/Research/Multinationals/Reports/News),
 * extracted once here for Phase 4's new Workspace pages rather than
 * retrofitting the stable earlier-phase pages that already work. */
export function EmptyState({ icon, title, body, action }: { icon: RuwadIconName; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <RuwadIcon name={icon} size={30} />
      <h4>{title}</h4>
      <p>{body}</p>
      {action}
    </div>
  );
}
