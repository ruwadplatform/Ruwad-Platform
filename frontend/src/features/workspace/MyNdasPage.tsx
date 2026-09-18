"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { SessionLoading } from "@/components/workspace/SessionLoading";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToast } from "@/components/shell/ToastProvider";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { ApiError } from "@/lib/api/client";
import {
  fetchOwnerRequests, fetchMyRequests, reviewDataRoomRequest,
  type OwnerDataRoomRequest, type MyDataRoomRequest, type DataRoomStatus, type DataRoomKind,
} from "@/lib/api/data-room";

type MainTab = "review" | "mine";
type Filter = "pending" | "approved" | "rejected";

const PROFILE_PATH: Record<DataRoomKind, string> = { STARTUP: "startups", INVESTOR: "investors", HUB: "hubs", MULTINATIONAL: "multinationals" };

function bucket(status: DataRoomStatus): Filter {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

function StatusBadge({ status }: { status: DataRoomStatus }) {
  const b = bucket(status);
  const cls = b === "approved" ? "badge-good" : b === "rejected" ? "badge-crit" : "badge-warn";
  const label = b === "approved" ? "Approved" : b === "rejected" ? "Rejected" : "Pending";
  return <span className={`badge ${cls}`}>{label}</span>;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/** Data Room access, both sides: requests other users made to entities you
 * OWN (approve/reject here — the backend re-checks ownership on every
 * action), and the requests you made yourself. */
export function MyNdasPage() {
  const { loggedIn, hydrated } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();

  const [tab, setTab] = useState<MainTab>("review");
  const [filter, setFilter] = useState<Filter>("pending");
  const [owned, setOwned] = useState<OwnerDataRoomRequest[] | null>(null);
  const [mine, setMine] = useState<MyDataRoomRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchOwnerRequests(), fetchMyRequests()])
      .then(([o, m]) => { setOwned(o); setMine(m); setError(null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your Data Room requests."));
  }, []);

  useEffect(() => {
    if (hydrated && loggedIn) load();
  }, [hydrated, loggedIn, load]);

  function confirmReview(req: OwnerDataRoomRequest, decision: "APPROVED" | "REJECTED") {
    const approve = decision === "APPROVED";
    openModal(
      <ConfirmModal
        title={approve ? "Approve this request?" : "Reject this request?"}
        body={approve
          ? `${req.requesterName} will get access to ${req.entityName}'s Data Room and be notified by email.`
          : `${req.requesterName} will be told their request for ${req.entityName}'s Data Room was declined. It stays locked for them.`}
        confirmLabel={approve ? "Approve" : "Reject"}
        danger={!approve}
        onCancel={closeModal}
        onConfirm={async () => {
          try {
            await reviewDataRoomRequest(req.id, decision);
            toast(approve ? "Request approved" : "Request rejected");
            load();
          } catch (e) {
            toast(e instanceof ApiError ? e.message : "Couldn't update the request — please try again.");
          } finally {
            closeModal();
          }
        }}
      />,
    );
  }

  if (!hydrated) return <SessionLoading />;
  if (!loggedIn) return <WorkspaceGate title="Sign in to view your NDAs" body="Sign in to review Data Room requests for your profiles and track the ones you've made." />;

  const pendingCount = (owned ?? []).filter((r) => bucket(r.status) === "pending").length;
  const shownOwned = (owned ?? []).filter((r) => bucket(r.status) === filter);

  return (
    <div>
      <IntelligencePageHeader title="My NDAs" description="Data Room access requests for the profiles you own, and the requests you've made." />

      <div className="tabs mt-20">
        <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>
          Requests to review{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My requests</button>
      </div>

      {error && <p className="small muted">{error}</p>}
      {!error && (owned === null || mine === null) && <p className="small muted">Loading…</p>}

      {!error && owned !== null && tab === "review" && (
        <>
          <div className="persona-row">
            {(["pending", "approved", "rejected"] as Filter[]).map((f) => (
              <button key={f} className={`persona-btn${f === filter ? " active" : ""}`} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)} ({owned.filter((r) => bucket(r.status) === f).length})
              </button>
            ))}
          </div>
          {shownOwned.length === 0 ? (
            <EmptyState
              icon="lock"
              title={owned.length === 0 ? "No Data Room requests yet" : `No ${filter} requests`}
              body={owned.length === 0 ? "When someone requests access to a profile you own, it will show up here for you to approve or reject." : "Nothing here right now."}
            />
          ) : (
            shownOwned.map((r) => (
              <div className="panel panel-pad mb-12" key={r.id}>
                <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex gap-8" style={{ alignItems: "center", flexWrap: "wrap" }}>
                      <b>{r.requesterName}</b>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="small muted mt-4">{r.requesterEmail}</div>
                    <div className="small mt-8">
                      {r.requestType} · <Link href={`/${PROFILE_PATH[r.kind]}/${r.entitySlug}`} style={{ textDecoration: "underline" }}>{r.entityName}</Link>
                    </div>
                    <div className="small muted mt-4">Requested {fmtDate(r.requestedAt)}{bucket(r.status) !== "pending" ? ` · Updated ${fmtDate(r.updatedAt)}` : ""}</div>
                  </div>
                  {bucket(r.status) === "pending" && (
                    <div className="flex gap-8">
                      <button className="btn btn-outline" onClick={() => confirmReview(r, "REJECTED")}>Reject</button>
                      <button className="btn btn-primary" onClick={() => confirmReview(r, "APPROVED")}>Approve</button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {!error && mine !== null && tab === "mine" && (
        mine.length === 0 ? (
          <EmptyState icon="lock" title="You haven't requested any Data Rooms" body="Open a startup or investor profile and use its Data Room tab to request access." />
        ) : (
          mine.map((r) => (
            <div className="panel panel-pad mb-12" key={r.id}>
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <b>{r.entityName ?? "Profile no longer available"}</b>
                  <div className="small muted mt-4">Data Room Access · Requested {fmtDate(r.createdAt)}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
