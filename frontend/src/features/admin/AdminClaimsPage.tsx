"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { WorkspaceGate } from "@/components/workspace/WorkspaceGate";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { useSession } from "@/hooks/use-store";
import { fetchAdminClaims, approveClaim, rejectClaim, type AdminClaimRow, type ClaimStatus } from "@/lib/api/claims";
import { ApiError } from "@/lib/api/client";

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong");
const KIND_ROUTE: Record<AdminClaimRow["kind"], string> = { STARTUP: "startups", INVESTOR: "investors", HUB: "hubs", RESEARCH: "research", MULTINATIONAL: "multinationals" };
const KIND_LABEL: Record<AdminClaimRow["kind"], string> = { STARTUP: "Startup", INVESTOR: "Investor", HUB: "Hub / Enabler", RESEARCH: "Research Institution", MULTINATIONAL: "Multinational" };
const STATUS_FILTERS: (ClaimStatus | "")[] = ["", "PENDING", "APPROVED", "REJECTED"];

function StatusBadge({ status }: { status: ClaimStatus }) {
  if (status === "APPROVED") return <span className="badge badge-good">Approved</span>;
  if (status === "REJECTED") return <span className="badge badge-crit">Rejected</span>;
  return <span className="badge badge-warn">Pending Review</span>;
}

export function AdminClaimsPage() {
  const { loggedIn, isAdmin } = useSession();
  const toast = useToast();
  const { openModal, closeModal } = useModal();
  const [rows, setRows] = useState<AdminClaimRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus | "">("PENDING");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchAdminClaims().then(setRows).catch((e) => setError(errText(e)));
  }, [isAdmin]);
  useEffect(load, [load]);

  async function approve(row: AdminClaimRow) {
    setBusyId(row.id);
    try {
      await approveClaim(row.id);
      toast(`Approved — ${row.claimantEmail ?? "the claimant"} now owns the ${KIND_LABEL[row.kind].toLowerCase()} listing`);
      load();
    } catch (e) { toast(errText(e)); } finally { setBusyId(null); }
  }

  function confirmReject(row: AdminClaimRow) {
    openModal(
      <ConfirmModal
        title="Reject this claim?"
        body={`This tells ${row.claimantEmail ?? "the claimant"} their claim on ${row.entityName ?? "this listing"} was not approved.`}
        confirmLabel="Reject Claim"
        danger
        onCancel={closeModal}
        onConfirm={async () => {
          closeModal();
          setBusyId(row.id);
          try { await rejectClaim(row.id); toast("Claim rejected"); load(); }
          catch (e) { toast(errText(e)); } finally { setBusyId(null); }
        }}
      />,
    );
  }

  if (!loggedIn) return <WorkspaceGate title="Sign in as an administrator" body="Sign in with an administrator account to review listing claims." />;
  if (!isAdmin) return <EmptyState icon="lock" title="Administrator access required" body="This area is limited to RUWĀD platform administrators." />;

  const filtered = status ? (rows ?? []).filter((r) => r.status === status) : rows;

  return (
    <div>
      <IntelligencePageHeader title="Listing Claims" description="Review requests from users asking to be recognized as a listing's owner. Approving one grants them edit access to that profile." />

      <div className="toolbar mt-20">
        <select className="select" style={{ width: "auto" }} value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus | "")}>
          <option value="">All Statuses</option>
          {STATUS_FILTERS.filter(Boolean).map((s) => <option key={s} value={s}>{s === "PENDING" ? "Pending Review" : s === "APPROVED" ? "Approved" : "Rejected"}</option>)}
        </select>
      </div>

      <div className="mt-16">
        {error ? (
          <EmptyState icon="help" title="Couldn't load claims" body={error} />
        ) : filtered === null ? (
          <EmptyState icon="reports" title="Loading claims…" body="" />
        ) : !filtered.length ? (
          <EmptyState icon="check" title="No claims match these filters." body="Requests to claim a listing will show up here for review." />
        ) : (
          <div className="panel scroll-x">
            <table className="data-table">
              <thead>
                <tr><th>Listing</th><th>Type</th><th>Claimant</th><th>Stated Role</th><th>Verification Note</th><th>Submitted</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td><div className="cell-main">{c.entityName ?? "(listing not found)"}</div></td>
                    <td>{KIND_LABEL[c.kind]}</td>
                    <td className="small">{c.claimantEmail ?? "—"}</td>
                    <td className="small">{c.role}</td>
                    <td className="small" style={{ maxWidth: 240, overflowWrap: "anywhere" }}>{c.note || "—"}</td>
                    <td className="small">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td><StatusBadge status={c.status} />{c.status === "REJECTED" && c.rejectionReason && <div className="fs-11 muted mt-4">{c.rejectionReason}</div>}</td>
                    <td>
                      <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                        {c.status === "PENDING" && (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={busyId === c.id} onClick={() => approve(c)}>{busyId === c.id ? "…" : "Approve"}</button>
                            <button className="btn btn-outline btn-sm" disabled={busyId === c.id} onClick={() => confirmReject(c)}>Reject</button>
                          </>
                        )}
                        <Link className="btn btn-outline btn-sm" href={`/${KIND_ROUTE[c.kind]}/${c.entityId}`} target="_blank"><RuwadIcon name="globe" size={12} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
