"use client";

import { useModal } from "@/components/shell/ModalProvider";
import { IntroductionStatusBadge } from "./IntroductionStatusBadge";
import { IntroductionRequestDetail } from "./IntroductionRequestDetail";
import type { IntroRequest } from "@/lib/store";

export function IntroductionRequestRow({ request: r }: { request: IntroRequest }) {
  const { openModal } = useModal();
  const target = r.investor ?? r.startup ?? "—";
  return (
    <tr style={{ cursor: "pointer" }} onClick={() => openModal(<IntroductionRequestDetail request={r} />)}>
      <td className="cell-main">{target}</td>
      <td>{r.investor ? "Investor" : "Startup"}</td>
      <td className="cell-sub">{r.reasonType ?? "—"}</td>
      <td className="cell-sub">{r.date}</td>
      <td className="cell-sub">{r.updatedAt ?? r.date}</td>
      <td><IntroductionStatusBadge status={r.status} /></td>
    </tr>
  );
}
