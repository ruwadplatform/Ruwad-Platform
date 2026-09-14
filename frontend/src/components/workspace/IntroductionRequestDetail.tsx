"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { IntroductionStatusBadge } from "./IntroductionStatusBadge";
import { useStartups, useInvestors } from "@/hooks/use-directory-data";
import type { IntroRequest } from "@/lib/store";

/** Detail view for one introduction request — opened in the existing
 * modal system (ModalProvider), matching how RequestIntroModal already
 * works, rather than a second/inline UI pattern. */
export function IntroductionRequestDetail({ request: r }: { request: IntroRequest }) {
  const { closeModal } = useModal();
  const router = useRouter();
  const { data: STARTUPS } = useStartups();
  const { data: INVESTORS } = useInvestors();

  const target = r.investor ?? r.startup ?? "—";
  const targetIsInvestor = !!r.investor;
  const relatedInvestor = r.investor ? INVESTORS.find((v) => v.name === r.investor) : undefined;
  const relatedStartup = r.startup ? STARTUPS.find((s) => s.name === r.startup) : undefined;
  const relatedHref = relatedInvestor ? `/investors/${relatedInvestor.id}` : relatedStartup ? `/startups/${relatedStartup.id}` : null;

  return (
    <div className="modal-box-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 className="fs-15">Introduction Request</h3>
        <IntroductionStatusBadge status={r.status} />
      </div>

      <div className="stat-mini-row mt-16">
        <div className="stat-mini"><div className="sm-label">Target</div><div className="sm-val fs-15">{target}</div></div>
        <div className="stat-mini"><div className="sm-label">Entity Type</div><div className="sm-val fs-15">{targetIsInvestor ? "Investor" : "Startup"}</div></div>
        <div className="stat-mini"><div className="sm-label">Date Submitted</div><div className="sm-val fs-15">{r.date}</div></div>
        <div className="stat-mini"><div className="sm-label">Purpose</div><div className="sm-val fs-15">{r.reasonType ?? "—"}</div></div>
      </div>

      <div className="mt-16">
        <h4 className="eyebrow mb-8">Reason</h4>
        <p className="small" style={{ lineHeight: "var(--line-height-relaxed)" }}>{r.reason || "—"}</p>
      </div>

      <div className="mt-16">
        <h4 className="eyebrow mb-8">Your Message</h4>
        <p className="small" style={{ lineHeight: "var(--line-height-relaxed)" }}>{r.message || "—"}</p>
      </div>

      <div className="mt-16">
        <h4 className="eyebrow mb-8">Status History</h4>
        <div className="funding-timeline">
          {(r.statusHistory ?? [{ status: r.status, date: r.date }]).map((h, i) => (
            <div className="ft-item" key={i}>
              <div className="ft-top"><span className="ft-round">{h.status}</span></div>
              <div className="ft-meta">{h.date}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-8 mt-20">
        {relatedHref && <button className="btn btn-outline" onClick={() => { closeModal(); router.push(relatedHref); }}><RuwadIcon name="globe" size={13} /> View Profile</button>}
        <button className="btn btn-primary" onClick={closeModal}>Close</button>
      </div>
    </div>
  );
}
