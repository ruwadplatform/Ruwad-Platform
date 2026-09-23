"use client";

import { useEffect, useRef, useState } from "react";
import { COUNTRY_DIAL_CODES, countryForIso2 } from "@/data/phone-codes";
import { RuwadIcon } from "@/components/icons/ruwad-icon";

/** flagcdn.com serves a free, no-key-required SVG per ISO 3166-1 alpha-2 code — used instead of the
 * flag emoji because Windows' font stack renders regional-indicator emoji as plain two-letter text
 * (no color-flag glyphs), which made the dial-code selector show "SA" instead of a flag. */
const flagUrl = (iso2: string) => `https://flagcdn.com/${iso2.toLowerCase()}.svg`;

/** A dialing-code picker (flag + "+code", searchable) and a number <input>, styled with the app's
 * existing `.input` box but merged (via `.phone-input-group` in components.css) into one control.
 * `iso2` is the selected country's ISO 3166-1 alpha-2 code — the source of truth for the dial code;
 * `number` is the local part only, as the user is typing it (spaces and dashes allowed). Combining
 * the two into a single E.164 value is the caller's job (see lib/phone.ts), not this component's —
 * it only renders and reports the two raw pieces. A native <select> can't render flag images inside
 * its options (only plain text), so this is a custom trigger + `.dropdown-panel` listbox instead. */
export function PhoneInput({ iso2, onIso2Change, number, onNumberChange, id }: {
  iso2: string;
  onIso2Change: (iso2: string) => void;
  number: string;
  onNumberChange: (v: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = countryForIso2(iso2);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRY_DIAL_CODES.filter((c) => c.country.toLowerCase().includes(q) || c.dial.includes(q.replace(/^\+/, "")))
    : COUNTRY_DIAL_CODES;

  return (
    <div className="phone-input-group">
      <div className="phone-code-select" ref={rootRef}>
        <button
          type="button"
          className="input phone-code-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country calling code, ${selected ? `${selected.country} +${selected.dial}` : iso2}`}
          onClick={() => { setQuery(""); setOpen((o) => !o); }}
        >
          <img className="phone-code-flag" src={flagUrl(iso2)} alt="" width={20} height={15} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span>+{selected?.dial ?? ""}</span>
          <RuwadIcon name="chevron" size={11} />
        </button>
        <div className={`dropdown-panel phone-code-panel${open ? " open" : ""}`} role="listbox">
          <input
            ref={searchRef}
            className="input phone-code-search"
            placeholder="Search country or code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="phone-code-list">
            {filtered.length === 0 && <div className="phone-code-empty">No matches</div>}
            {filtered.map((c) => (
              <button
                key={c.iso2}
                type="button"
                role="option"
                aria-selected={c.iso2 === iso2}
                className={`dropdown-menu-item${c.iso2 === iso2 ? " active" : ""}`}
                onClick={() => { onIso2Change(c.iso2); setOpen(false); }}
              >
                <img className="phone-code-flag" src={flagUrl(c.iso2)} alt="" width={20} height={15} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                <span className="phone-code-name">{c.country}</span>
                <span className="phone-code-dial">+{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <input
        id={id}
        className="input"
        type="tel"
        inputMode="tel"
        placeholder="50 123 4567"
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
      />
    </div>
  );
}
