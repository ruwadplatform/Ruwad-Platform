import { RuwadIcon } from "@/components/icons/ruwad-icon";

export interface CompletenessCheck {
  label: string;
  ok: boolean;
}

/** Profile completeness meter with what is done and what is still missing. Styled by the My Startup page's `.ms-*` card rules. */
export function ProfileCompleteness({ checks }: { checks: CompletenessCheck[] }) {
  const done = checks.filter((c) => c.ok);
  const missing = checks.filter((c) => !c.ok);
  const pct = Math.round((done.length / checks.length) * 100);
  const tone = pct >= 80 ? "good" : pct >= 50 ? "warn" : "crit";

  return (
    <section className="ms-card ms-wide">
      <header className="ms-card-head">
        <div><h3>Profile Completeness</h3><p>{done.length} of {checks.length} items complete</p></div>
        <b className="ms-big">{pct}%</b>
      </header>
      <div className={`ms-bar ms-bar-${tone}`} role="progressbar" aria-label="Profile completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>

      <div className="ms-checks">
        <div>
          <div className="ms-eyebrow">Completed</div>
          <ul>
            {done.map((c) => <li key={c.label} className="ms-check-done"><RuwadIcon name="check" size={13} /> {c.label}</li>)}
          </ul>
        </div>
        {missing.length > 0 && (
          <div>
            <div className="ms-eyebrow">Still missing</div>
            <ul>
              {missing.map((c) => <li key={c.label} className="ms-check-missing"><span aria-hidden>!</span> {c.label}</li>)}
            </ul>
          </div>
        )}
      </div>

      {missing.length > 0 && <p className="ms-notice">Next step: add {missing[0].label.toLowerCase()} to improve how your profile appears to investors and partners.</p>}
    </section>
  );
}
