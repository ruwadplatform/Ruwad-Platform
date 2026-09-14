"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useToast } from "@/components/shell/ToastProvider";
import { requireAuth } from "@/lib/store";

/** Simplified port of dataRoomButtonHtml() (js/dataroom.js:393-411) — the
 * full Data Room / NDA state machine (request → sign → access) is a later
 * phase; this renders the same default "Request Data Room Access" state
 * (btn-outline + lock icon) every dataRoomButtonHtml() call falls back to
 * when there's no request/agreement on file yet, which matches every
 * profile's actual state right now (no Data Room data exists to diverge
 * from that default). */
export function DataRoomButton({ companyId }: { companyId: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-outline"
      onClick={() => {
        if (!requireAuth("data-room-request", { companyId })) return;
        toast("Data Room requests — coming soon");
      }}
    >
      <RuwadIcon name="lock" size={14} /> Request Data Room Access
    </button>
  );
}
