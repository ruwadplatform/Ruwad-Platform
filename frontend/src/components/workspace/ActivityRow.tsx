"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import type { ActivityItem } from "@/lib/store";

const ICONS: Record<ActivityItem["type"], RuwadIconName> = {
  watchlist_add: "star", search_saved: "bookmark", intro_submitted: "intros", listing_edited: "edit", profile_viewed: "user", profile_updated: "user",
};

export function ActivityRow({ item }: { item: ActivityItem }) {
  const router = useRouter();
  return (
    <div className="event-item" style={{ cursor: item.route ? "pointer" : "default", display: "flex", gap: 10, alignItems: "flex-start" }} onClick={() => item.route && router.push(item.route)}>
      <div className="cc-icon" style={{ width: 30, height: 30, flex: "none" }}><RuwadIcon name={ICONS[item.type]} size={14} /></div>
      <div>
        <div className="fs-13">{item.text}</div>
        <div className="small muted mt-4">{item.date}</div>
      </div>
    </div>
  );
}
