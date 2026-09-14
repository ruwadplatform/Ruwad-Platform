"use client";

import { Fragment, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { useStartups } from "@/hooks/use-directory-data";
import type { Startup } from "@/types/entities";

const COMPARE_MAX = 5;

/** Ported verbatim from openCompareModal()/compareModalHtml()/compareTableHtml()
 * (js/profiles.js:79-146). Multinationals aren't in this phase's scope, so
 * the comparison pool is Startups only (the old app also pools
 * Multinationals in here — add back when that entity type is built). */
export function CompareModal({ initialId }: { initialId: string }) {
  const { closeModal } = useModal();
  const { data: STARTUPS } = useStartups();
  const [ids, setIds] = useState<string[]>([initialId]);

  const selected = ids.map((id) => STARTUPS.find((x) => x.id === id)).filter(Boolean) as Startup[];
  const available = STARTUPS.filter((x) => !ids.includes(x.id));
  const remaining = COMPARE_MAX - selected.length;

  function addCompany(id: string) {
    if (!id || ids.includes(id) || ids.length >= COMPARE_MAX) return;
    setIds((cur) => [...cur, id]);
  }
  function removeCompany(id: string) {
    if (ids.length <= 1) return;
    setIds((cur) => cur.filter((x) => x !== id));
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Compare Companies</h3>
      <p className="muted small mt-8">Comparing {selected.length} of up to {COMPARE_MAX} companies.</p>
      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        {selected.map((s) => (
          <span className="chip" key={s.id}>
            {s.name}
            {selected.length > 1 && <span className="x" style={{ cursor: "pointer" }} onClick={() => removeCompany(s.id)}><RuwadIcon name="x" size={11} /></span>}
          </span>
        ))}
      </div>
      {remaining > 0 ? (
        <div className="field mt-16">
          <label>Add a company</label>
          <select className="select" value="" onChange={(e) => addCompany(e.target.value)}>
            <option value="">Select a company to add ({remaining} slot{remaining === 1 ? "" : "s"} left)</option>
            {available.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : (
        <p className="small muted mt-8">Maximum of {COMPARE_MAX} companies reached.</p>
      )}
      <div className="mt-16">{selected.length > 1 && <CompareTable list={selected} />}</div>
      <div className="btn-row mt-16"><button className="btn btn-outline" onClick={closeModal}>Close</button></div>
    </div>
  );
}

function CompareTable({ list }: { list: Startup[] }) {
  const cols = `150px repeat(${list.length},minmax(140px,1fr))`;
  const rows: [string, (x: Startup) => React.ReactNode][] = [
    ["Category", (x) => x.category],
    ["Sub-sector", (x) => x.subsector],
    ["Stage", (x) => x.stage],
    ["Headquarters", (x) => x.hq],
    ["Founded", (x) => x.founded],
    ["Employees", (x) => x.employees],
    ["Total Raised", (x) => `SAR ${(x.fundingTotal || 0).toFixed(1)}M`],
    ["RUWĀD Score", (x) => x.score],
    ["SFDA Status", (x) => x.regulatory?.sfda],
    ["Revenue", (x) => x.traction?.revenue],
    ["Growth", (x) => x.traction?.growth],
    ["Investors", (x) => (x.investorIds || []).length],
  ];
  return (
    <div className="scroll-x">
      <div style={{ minWidth: 150 + list.length * 140 }}>
        <div className="cmp-head mb-8" style={{ gridTemplateColumns: cols }}>
          <div />
          {list.map((x) => <b key={x.id}>{x.name}</b>)}
        </div>
        <dl className="kv-grid cmp-grid" style={{ gridTemplateColumns: cols }}>
          {rows.map(([label, get]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              {list.map((x) => <dd key={x.id + label}>{get(x) ?? "—"}</dd>)}
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
