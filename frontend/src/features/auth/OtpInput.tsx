"use client";

import { useEffect, useRef } from "react";
import { OTP_LENGTH, applyInput, backspace } from "./verify-email-logic";

/** Six one-digit boxes for the email code. Typing moves on, Backspace steps back, the arrow keys move, and a pasted (or autofilled) code spreads over all six.
 * The first box asks the phone or browser for a one-time code (`autocomplete="one-time-code"`), so a code from the email can be filled in with one tap. */
export function OtpInput({ digits, onChange, onEnter, disabled, invalid, autoFocus, label }: {
  digits: string[];
  onChange: (next: string[]) => void;
  /** Called when Enter is pressed in a box (the page decides whether the code is complete enough to submit). */
  onEnter?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  /** What the group is called to a screen reader. */
  label: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => {
    const box = refs.current[i];
    if (box) { box.focus(); box.select(); }
  };

  useEffect(() => { if (autoFocus) focus(0); }, [autoFocus]);

  function handleChange(i: number, raw: string) {
    const r = applyInput(digits, i, raw);
    onChange(r.digits);
    focus(r.focus);
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const r = backspace(digits, i);
      onChange(r.digits);
      focus(r.focus);
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(Math.max(i - 1, 0)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focus(Math.min(i + 1, OTP_LENGTH - 1)); }
    else if (e.key === "Enter") onEnter?.();
  }

  function handlePaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    handleChange(i, e.clipboardData.getData("text"));
  }

  return (
    <div className="otp-row" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className={`otp-box${invalid ? " is-invalid" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={OTP_LENGTH}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
          aria-invalid={invalid ? true : undefined}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
