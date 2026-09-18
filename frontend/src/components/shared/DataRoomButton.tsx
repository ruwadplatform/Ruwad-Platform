"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useToast } from "@/components/shell/ToastProvider";
import { requireAuth } from "@/lib/store";
import { ApiError } from "@/lib/api/client";
import { requestDataRoomAccess, type DataRoomKind } from "@/lib/api/data-room";

/** Header shortcut for the same request the Data Room tab makes — one
 * POST /data-room/request, which the backend dedupes per (user, entity), so
 * clicking here and using the tab can never create two pending requests. The
 * tab shows the resulting state (pending / approved / declined). */
export function DataRoomButton({ companyId, kind, entityId }: { companyId: string; kind: DataRoomKind; entityId?: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-outline"
      onClick={async () => {
        if (!requireAuth("data-room-request", { companyId })) return;
        if (!entityId) return;
        try {
          await requestDataRoomAccess(kind, entityId);
          toast("Access requested — the profile owner has been notified. Track it in the Data Room tab.");
        } catch (e) {
          toast(e instanceof ApiError ? e.message : "Couldn't send your request — please try again.");
        }
      }}
    >
      <RuwadIcon name="lock" size={14} /> Request Data Room Access
    </button>
  );
}
