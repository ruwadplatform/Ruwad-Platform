"use client";

import { useState } from "react";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { saveSearch } from "@/lib/store";

/** Ported from openSaveSearchModal()/confirmSaveSearch() (js/watchlist.js:95-114). */
export function SaveSearchModal({
  entityType, entityLabel, suggestedLabel, count, filters, search,
}: {
  entityType: string; entityLabel: string; suggestedLabel: string; count: number; filters: Record<string, string[]>; search: string;
}) {
  const { closeModal } = useModal();
  const toast = useToast();
  const [label, setLabel] = useState(suggestedLabel.slice(0, 60));

  function confirm() {
    saveSearch(entityType, label.trim() || "Untitled search", search, filters, count);
    closeModal();
    toast("Search saved");
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Save this search</h3>
      <p className="muted small mt-8">{count} {entityLabel.toLowerCase()} match your current search and filters. Saving stores those filters — not just a label — so you can re-run this exact search later.</p>
      <div className="field mt-16"><label>Name</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <button className="btn btn-primary btn-block btn-lg" onClick={confirm}>Save Search</button>
    </div>
  );
}
