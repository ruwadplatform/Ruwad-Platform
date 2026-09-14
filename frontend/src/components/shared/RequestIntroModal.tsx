"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { useToast } from "@/components/shell/ToastProvider";
import { addIntro } from "@/lib/store";
import { useInvestors } from "@/hooks/use-directory-data";

/** Ported verbatim from openIntroModal()/submitIntro() (js/profiles.js:647-677)
 * — one shared modal for both directions: from a Startup profile
 * `investorName` is empty (shows the investor <select>); from an Investor
 * profile `startupName` is empty (shows the "your startup" input). */
export function RequestIntroModal({ investorName, startupName }: { investorName?: string; startupName?: string }) {
  const { closeModal, openModal } = useModal();
  const toast = useToast();
  const router = useRouter();
  const { data: INVESTORS } = useInvestors();
  const [investorChoice, setInvestorChoice] = useState("");
  // Once INVESTORS loads, an untouched selector defaults to the first
  // investor — derived at render time instead of synced via an effect, so
  // there's no extra render pass once the list arrives.
  const investor = investorName || investorChoice || INVESTORS[0]?.name || "";
  const setInvestor = setInvestorChoice;
  const [startup, setStartup] = useState(startupName || "");
  const [looking, setLooking] = useState("Investment");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  function submit() {
    if (!reason.trim() || !message.trim()) {
      toast("Please complete the required fields");
      return;
    }
    addIntro({
      investor: investorName || investor,
      startup: startupName || startup,
      reasonType: looking,
      reason: reason.trim(),
      message: message.trim(),
    });
    closeModal();
    const inv = investorName || investor;
    openModal(
      <div className="modal-box-pad" style={{ textAlign: "center" }}>
        <div className="modal-icon-ok"><RuwadIcon name="check" size={26} /></div>
        <h3 className="fs-15">Introduction Request Sent</h3>
        <p className="muted small mt-8">{inv} will be notified of your request (demo only).</p>
        <button className="btn btn-primary btn-block mt-20" onClick={() => { closeModal(); router.push("/introductions"); }}>View Introduction Requests</button>
      </div>,
    );
  }

  return (
    <div className="modal-box-pad">
      <h3 className="fs-15">Request Introduction</h3>
      <p className="muted small mt-8 mb-16">
        Investor: <b>{investorName || "Select below"}</b>
        {startupName ? <>&nbsp;·&nbsp;Startup: <b>{startupName}</b></> : null}
      </p>
      {!investorName && (
        <div className="field">
          <label>Investor</label>
          <select className="select" value={investor} onChange={(e) => setInvestor(e.target.value)}>
            {INVESTORS.map((v) => <option key={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}
      {!startupName && (
        <div className="field">
          <label>Your Startup / Organization</label>
          <input className="input" value={startup} onChange={(e) => setStartup(e.target.value)} placeholder="Your startup name" />
        </div>
      )}
      <div className="field">
        <label>What are you looking for?</label>
        <select className="select" value={looking} onChange={(e) => setLooking(e.target.value)}>
          <option>Investment</option><option>Strategic Partnership</option><option>Commercial Partnership</option><option>Mentorship</option><option>Other</option>
        </select>
      </div>
      <div className="field">
        <label>Reason for introduction <span className="req">*</span></label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Raising a Series A and looking for a lead" />
      </div>
      <div className="field">
        <label>Message <span className="req">*</span></label>
        <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short note to include with your request" />
      </div>
      <button className="btn btn-primary btn-block btn-lg" onClick={submit}>Send Request</button>
    </div>
  );
}
