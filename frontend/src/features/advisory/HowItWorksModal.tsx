"use client";

import { useModal } from "@/components/shell/ModalProvider";

const STEPS: { title: string; body: string }[] = [
  { title: "Find an advisor", body: "Search or filter by name, institution, specialization or expertise." },
  { title: "Review the advisor's profile", body: "See their background, research areas and the consultations they offer." },
  { title: "Select a consultation service", body: "Choose the type of consultation that fits your question; each shows its length." },
  { title: "Choose an available date and time", body: "Only the times the advisor has opened are shown, in Riyadh time or your own." },
  { title: "Confirm the booking", body: "Review the details, pick your startup profile and confirm. You need to be signed in." },
  { title: "Attend an online consultation through RUWĀD", body: "Join the meeting from your Consultations page at the scheduled time." },
];

/** The "How It Works" explainer opened from the Advisory Services header. */
export function HowItWorksModal() {
  const { closeModal } = useModal();
  return (
    <div className="modal-box-pad adv-how">
      <h3 className="fs-15">How Advisory Services works</h3>
      <ol className="adv-how-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="adv-how-num" aria-hidden="true">{i + 1}</span>
            <div>
              <b>{s.title}</b>
              <p>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="small muted mt-16">Advisory Services is being introduced in stages.</p>
      <button type="button" className="btn btn-primary btn-block mt-16" onClick={closeModal}>Got it</button>
    </div>
  );
}
