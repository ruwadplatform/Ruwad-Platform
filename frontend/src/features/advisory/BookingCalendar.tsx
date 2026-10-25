"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { MAX_BOOKING_DAYS, addDays, daysInMonth, formatLongDate, formatMonth, weekdayOf, ymdKey, type Ymd } from "./advisory-time";

const WEEKDAY_HEADS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CalendarMonth { y: number; m: number }

/** A month grid for choosing a consultation date. Only dates in `available` can be chosen; past dates and dates beyond the booking horizon are
 * never in that set, and the month arrows stop at today's month and at the last month that still has bookable days. Weeks start on Sunday. */
export function BookingCalendar({ month, onMonthChange, selected, available, today, onSelect }: {
  month: CalendarMonth;
  onMonthChange: (m: CalendarMonth) => void;
  selected: string;
  available: Set<string>;
  today: Ymd;
  onSelect: (key: string) => void;
}) {
  const last = addDays(today, MAX_BOOKING_DAYS);
  const monthIndex = (y: number, m: number) => y * 12 + (m - 1);
  const canPrev = monthIndex(month.y, month.m) > monthIndex(today.y, today.m);
  const canNext = monthIndex(month.y, month.m) < monthIndex(last.y, last.m);
  const shift = (delta: number) => {
    const idx = monthIndex(month.y, month.m) + delta;
    onMonthChange({ y: Math.floor(idx / 12), m: (idx % 12) + 1 });
  };
  const lead = weekdayOf({ y: month.y, m: month.m, d: 1 });
  const count = daysInMonth(month.y, month.m);
  const todayKey = ymdKey(today);

  return (
    <div className="adv-cal" role="group" aria-label={`Choose a date, ${formatMonth(month.y, month.m)}`}>
      <div className="adv-cal-head">
        <button type="button" className="adv-cal-nav" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">
          <RuwadIcon name="chevron" size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
        <b aria-live="polite">{formatMonth(month.y, month.m)}</b>
        <button type="button" className="adv-cal-nav" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
          <RuwadIcon name="chevron" size={16} />
        </button>
      </div>
      <div className="adv-cal-grid">
        {WEEKDAY_HEADS.map((w) => <span key={w} className="adv-cal-dow" aria-hidden="true">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`pad${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const d = i + 1;
          const key = ymdKey({ y: month.y, m: month.m, d });
          const open = available.has(key);
          return (
            <button
              key={key}
              type="button"
              className={`adv-cal-day${open ? " is-open" : ""}${key === selected ? " is-selected" : ""}${key === todayKey ? " is-today" : ""}`}
              disabled={!open}
              aria-pressed={key === selected}
              aria-label={`${formatLongDate({ y: month.y, m: month.m, d })}${open ? "" : ", no availability"}`}
              onClick={() => onSelect(key)}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="adv-cal-legend"><span className="adv-cal-dot" aria-hidden="true" /> Days with open time are highlighted</p>
    </div>
  );
}
