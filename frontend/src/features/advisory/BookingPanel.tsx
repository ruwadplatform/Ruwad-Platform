"use client";

import { forwardRef, useEffect, useId, useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { BookingCalendar, type CalendarMonth } from "./BookingCalendar";
import { BookingReviewModal } from "./BookingReviewModal";
import { datesWithSlots, slotsForDate } from "./advisory-slots";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, parseYmd, riyadhDate } from "./advisory-time";
import type { AdvisorProfile } from "./advisory-types";

const MAX_DESCRIPTION = 500;

/** The booking form on the advisor profile: consultation type, date (month calendar), available time slots, duration, meeting format, an optional
 * description and Continue Booking. Slots come from the advisor's availability windows and update with the consultation type and the date. Times
 * are shown in Riyadh time (UTC+3) by default, or in the visitor's own zone. In this release it only opens a booking REVIEW: nothing is saved. */
export const BookingPanel = forwardRef<HTMLElement, {
  advisor: AdvisorProfile;
  serviceId: string;
  onServiceChange: (id: string) => void;
  flash: boolean;
}>(function BookingPanel({ advisor, serviceId, onServiceChange, flash }, ref) {
  const { openModal } = useModal();
  const ids = { type: useId(), date: useId(), desc: useId(), calendar: useId() };
  const [now] = useState(() => new Date());
  const today = useMemo(() => riyadhDate(now), [now]);
  const service = advisor.services.find((s) => s.id === serviceId) ?? advisor.services[0]!;

  const available = useMemo(() => datesWithSlots(advisor, service.minutes, now), [advisor, service.minutes, now]);
  const firstDate = useMemo(() => [...available].sort()[0] ?? "", [available]);
  const [pickedDate, setPickedDate] = useState("");
  const [pickedTime, setPickedTime] = useState("");
  const [description, setDescription] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<CalendarMonth | null>(null);
  const [localTz, setLocalTz] = useState<string | null>(null);
  const [tzMode, setTzMode] = useState<"riyadh" | "local">("riyadh");

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && offsetLabel(new Date(), tz) !== offsetLabel(new Date(), RIYADH_TZ)) setLocalTz(tz);
  }, []);

  // A chosen date stays only while it still has slots for this consultation type; otherwise the first open date is used.
  const dateKey = available.has(pickedDate) ? pickedDate : firstDate;
  const slots = useMemo(() => (dateKey ? slotsForDate(advisor, parseYmd(dateKey), service.minutes, now) : []), [advisor, dateKey, service.minutes, now]);
  const slot = slots.find((s) => s.time === pickedTime) ?? null;
  const shownMonth: CalendarMonth = viewMonth ?? (dateKey ? { y: parseYmd(dateKey).y, m: parseYmd(dateKey).m } : { y: today.y, m: today.m });
  const zone = tzMode === "local" && localTz ? localTz : RIYADH_TZ;
  const zoneLabel = zone === RIYADH_TZ ? `Riyadh (${offsetLabel(now, RIYADH_TZ)})` : `${zone.replace(/_/g, " ")} (${offsetLabel(now, zone)})`;

  function chooseDate(key: string) {
    setPickedDate(key);
    setPickedTime("");
    setCalOpen(false);
  }

  function continueBooking() {
    if (!slot || !dateKey) return;
    openModal(<BookingReviewModal draft={{ advisor, service, dateKey, slot, description, timeZone: zone }} />, "wide");
  }

  return (
    <section ref={ref} className={`adv-booking panel panel-pad${flash ? " is-flash" : ""}`} aria-label="Book a consultation" id="book">
      <h2 className="adv-booking-title">Book a Consultation</h2>
      <p className="adv-booking-sub">Select your preferred consultation type, date and time.</p>

      <div className="adv-bfield">
        <label htmlFor={ids.type}>Consultation type</label>
        <select id={ids.type} className="select" value={service.id} onChange={(e) => { onServiceChange(e.target.value); setPickedTime(""); }}>
          {advisor.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.minutes} min</option>)}
        </select>
      </div>

      <div className="adv-bfield">
        <label htmlFor={ids.date}>Select date</label>
        <button
          type="button"
          id={ids.date}
          className="adv-datefield"
          aria-expanded={calOpen}
          aria-controls={ids.calendar}
          disabled={!firstDate}
          onClick={() => setCalOpen((o) => !o)}
        >
          <RuwadIcon name="calendar" size={16} />
          <span>{dateKey ? formatDateUS(parseYmd(dateKey)) : "No dates available"}</span>
          <RuwadIcon name="chevron" size={14} style={{ transform: calOpen ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
        {calOpen && (
          <div id={ids.calendar}>
            <BookingCalendar month={shownMonth} onMonthChange={setViewMonth} selected={dateKey} available={available} today={today} onSelect={chooseDate} />
          </div>
        )}
      </div>

      <div className="adv-bfield">
        <div className="adv-slots-head">
          <b>Available time slots</b>
          <span className="adv-zone">{zoneLabel}</span>
        </div>
        {localTz && (
          <div className="seg-tabs adv-tz" role="group" aria-label="Time zone">
            <button type="button" className={tzMode === "riyadh" ? "active" : ""} aria-pressed={tzMode === "riyadh"} onClick={() => setTzMode("riyadh")}>Riyadh time</button>
            <button type="button" className={tzMode === "local" ? "active" : ""} aria-pressed={tzMode === "local"} onClick={() => setTzMode("local")}>My time zone</button>
          </div>
        )}
        {slots.length === 0 ? (
          <p className="adv-noslots" role="status">
            {firstDate ? "No time slots are available on this date. Please choose another date." : "This advisor has no open time in the next 60 days for this consultation type. Please check back later or choose another consultation type."}
          </p>
        ) : (
          <div className="adv-slots" role="group" aria-label={`Time slots on ${formatDateUS(parseYmd(dateKey))}`}>
            {slots.map((s) => (
              <button key={s.time} type="button" className={`adv-slot${s.time === slot?.time ? " is-selected" : ""}`} aria-pressed={s.time === slot?.time} onClick={() => setPickedTime(s.time)}>
                {formatClock(s.start, zone)}
              </button>
            ))}
          </div>
        )}
      </div>

      <dl className="adv-summary">
        <div><dt>Duration</dt><dd>{service.minutes} minutes</dd></div>
        <div><dt>Format</dt><dd>Online via RUWĀD</dd></div>
        <div><dt>Selected time</dt><dd>{slot ? `${formatDateUS(parseYmd(dateKey))} · ${formatClock(slot.start, zone)}` : "Choose a time"}</dd></div>
      </dl>

      <div className="adv-bfield">
        <label htmlFor={ids.desc}>Consultation details <span className="muted">(optional)</span></label>
        <textarea
          id={ids.desc}
          className="textarea"
          maxLength={MAX_DESCRIPTION}
          placeholder="Briefly describe your topic or specific questions for this consultation..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="char-counter">{description.length}/{MAX_DESCRIPTION}</div>
      </div>

      <button type="button" className="btn btn-primary btn-block btn-lg adv-continue" disabled={!slot} onClick={continueBooking}>
        Continue Booking <RuwadIcon name="arrow" size={16} />
      </button>
      <p className="adv-booking-foot">Demonstration only. No real booking or calendar reservation will be created.</p>
    </section>
  );
});
