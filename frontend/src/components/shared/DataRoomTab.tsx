"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useSession } from "@/hooks/use-store";
import { useToast } from "@/components/shell/ToastProvider";
import { ApiError } from "@/lib/api/client";
import { fetchDataRoomStatus, requestDataRoomAccess, type DataRoomKind, type DataRoomStatusResponse } from "@/lib/api/data-room";

type TabKind = "startup" | "investor" | "hub" | "multinational";
const API_KIND: Record<TabKind, DataRoomKind> = { startup: "STARTUP", investor: "INVESTOR", hub: "HUB", multinational: "MULTINATIONAL" };

/** One generic locked state for everyone who is not the owner, an admin or an
 * APPROVED requester — deliberately says nothing about what is (or isn't) in
 * the room: no names, counts or placeholder cards. The signed-in state comes
 * entirely from GET /data-room/status, which is also the only place document
 * metadata is ever returned, and only after the backend has verified
 * owner/admin/APPROVED access. */
function LockedPanel({ children }: { children?: React.ReactNode }) {
  return (
    <div className="panel panel-pad dr-locked-state">
      <div className="dr-lock-icon"><RuwadIcon name="lock" size={22} /></div>
      <h3 className="fs-15" style={{ marginTop: 12 }}>Protected Data Room</h3>
      <p className="muted small mt-8" style={{ maxWidth: 420, margin: "8px auto 0" }}>Request access to view confidential documents.</p>
      {children}
    </div>
  );
}

export function DataRoomTab({ kind, entityId }: { kind: TabKind; entityId?: string }) {
  const { loggedIn } = useSession();
  const router = useRouter();
  const toast = useToast();
  const apiKind = API_KIND[kind];

  const [state, setState] = useState<DataRoomStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(() => {
    if (!entityId) return;
    fetchDataRoomStatus(apiKind, entityId)
      .then((s) => { setState(s); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load Data Room status."));
  }, [apiKind, entityId]);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  async function handleRequest() {
    if (!entityId) return;
    setRequesting(true);
    try {
      await requestDataRoomAccess(apiKind, entityId);
      toast("Access requested — the profile owner has been notified");
      load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't send your request — please try again.");
    } finally {
      setRequesting(false);
    }
  }

  if (!loggedIn) {
    return (
      <LockedPanel>
        <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => router.push("/login")}>Sign In to Request Access</button>
          <button className="btn btn-outline" onClick={() => router.push("/signup")}>Create Account</button>
        </div>
      </LockedPanel>
    );
  }

  if (error) return <div className="panel panel-pad"><p className="small muted">{error}</p></div>;
  if (!entityId || !state) return <div className="panel panel-pad"><p className="small muted">Loading Data Room…</p></div>;

  if (state.isOwner || state.status === "APPROVED") {
    return (
      <div className="panel panel-pad">
        <div className="flex gap-8" style={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3 className="fs-15">Data Room</h3>
          <span className="badge badge-good">{state.isOwner ? "You own this profile" : "Access approved"}</span>
        </div>
        {state.isOwner && (
          <p className="small muted mt-8">
            Review incoming access requests from <a href="/my-ndas" style={{ textDecoration: "underline" }}>My NDAs</a>.
          </p>
        )}
        {state.documents.length === 0 ? (
          <p className="small muted mt-12">No documents have been added to this Data Room yet.</p>
        ) : (
          <div className="upload-tile-row mt-12">
            {state.documents.map((d) => (
              <div className="doc-card" key={d.id}>
                <div className="doc-icon"><RuwadIcon name="reports" size={15} /></div>
                <b>{d.name}</b>
                <span className="doc-status">{d.onFile ? "On file" : "Not yet uploaded"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (state.status === "REJECTED") {
    return (
      <LockedPanel>
        <div className="mt-16"><button className="btn btn-outline" disabled>Access Declined</button></div>
        <p className="muted small mt-8">The profile owner declined your request.</p>
      </LockedPanel>
    );
  }

  if (state.status !== "LOCKED") {
    return (
      <LockedPanel>
        <div className="mt-16"><button className="btn btn-outline" disabled>Access Request Pending</button></div>
        <p className="muted small mt-8">You&apos;ll get an email when the profile owner responds.</p>
      </LockedPanel>
    );
  }

  return (
    <LockedPanel>
      <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
        <button className="btn btn-primary" disabled={requesting} onClick={handleRequest}>{requesting ? "Requesting…" : "Request Data Room Access"}</button>
      </div>
    </LockedPanel>
  );
}
