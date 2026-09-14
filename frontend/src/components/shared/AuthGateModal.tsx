"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";

/** Ported verbatim from openAuthGateModal() (js/auth-gate.js:40-55). */
export function AuthGateModalContent({
  title = "Unlock RUWĀD Intelligence",
  body = "Create your free RUWĀD account to access:",
  benefits = ["Complete company profiles", "Advanced ecosystem search", "Investor intelligence", "RUWĀD analytics", "Watchlists", "Saved searches", "Introduction requests"],
}: { title?: string; body?: string; benefits?: string[] }) {
  const { closeModal } = useModal();
  const router = useRouter();
  return (
    <div className="modal-box-pad">
      <h3 className="fs-16">{title}</h3>
      <p className="muted small mt-8">{body}</p>
      <ul className="gate-benefits mt-12">
        {benefits.map((b) => <li key={b}><RuwadIcon name="check" size={13} /><span>{b}</span></li>)}
      </ul>
      <button className="btn btn-primary btn-block btn-lg mt-16" onClick={() => { closeModal(); router.push("/signup"); }}>Create Free Account</button>
      <p className="small muted mt-12" style={{ textAlign: "center" }}>
        Already a member? <span style={{ cursor: "pointer", textDecoration: "underline", color: "var(--green)" }} onClick={() => { closeModal(); router.push("/login"); }}>Sign In</span>
      </p>
    </div>
  );
}

export function useAuthGateModal() {
  const { openModal } = useModal();
  return (opts?: { title?: string; body?: string; benefits?: string[] }) => openModal(<AuthGateModalContent {...opts} />);
}
