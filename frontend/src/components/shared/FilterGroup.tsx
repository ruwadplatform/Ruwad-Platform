"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useAuthGateModal } from "./AuthGateModal";
import { useFilterDrawer } from "@/components/shell/FilterDrawerProvider";

/** Ported verbatim from filterGroup() (js/startups.js:126-129) — native
 * <details>/<summary>, chevron rotation driven by components.css's
 * `.filter-group[open] summary svg{transform:rotate(180deg)}`. */
export function FilterGroup({
  label, options, dataKey, checked, inputName,
}: { label: string; options: readonly string[]; dataKey: string; checked: string[]; inputName: string }) {
  return (
    <details className="filter-group" open>
      <summary>{label}<RuwadIcon name="chevron" size={13} /></summary>
      <div className="filter-opts">
        {options.map((o) => (
          <label key={o}>
            <input type="checkbox" name={inputName} value={o} data-fk={dataKey} defaultChecked={checked.includes(o)} /> {o}
          </label>
        ))}
      </div>
    </details>
  );
}

/** Ported verbatim from guestAdvancedFilterGateHtml() (js/auth-gate.js:95-100). */
export function GuestAdvancedFilterGate() {
  const openAuthGate = useAuthGateModal();
  const { closeDrawer } = useFilterDrawer();
  return (
    <div className="filter-gate">
      <p className="small muted">Advanced filters — funding range, founded year, technology and more — are available to RUWĀD members.</p>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => {
          closeDrawer();
          openAuthGate({ title: "Unlock Advanced Filters", benefits: ["Funding stage & range", "Founded year", "Technology categories", "Investor type", "Clinical & regulatory status"] });
        }}
      >
        Sign in to unlock
      </button>
    </div>
  );
}
