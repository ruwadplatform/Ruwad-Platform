"use client";

import { COUNTRY_DIAL_CODES, flagEmoji } from "@/data/phone-codes";

/** A dialing-code <select> (flag + "+code") and a number <input>, styled with the app's existing
 * `.input`/`.select` boxes but merged (via `.phone-input-group` in components.css) into one control.
 * `iso2` is the selected country's ISO 3166-1 alpha-2 code — the source of truth for the dial code;
 * `number` is the local part only, as the user is typing it (spaces and dashes allowed). Combining
 * the two into a single E.164 value is the caller's job (see lib/phone.ts), not this component's —
 * it only renders and reports the two raw pieces. */
export function PhoneInput({ iso2, onIso2Change, number, onNumberChange, id }: {
  iso2: string;
  onIso2Change: (iso2: string) => void;
  number: string;
  onNumberChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="phone-input-group">
      <select
        className="select"
        aria-label="Country calling code"
        value={iso2}
        onChange={(e) => onIso2Change(e.target.value)}
      >
        {COUNTRY_DIAL_CODES.map((c) => (
          <option key={c.iso2} value={c.iso2}>{flagEmoji(c.iso2)} +{c.dial}</option>
        ))}
      </select>
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
