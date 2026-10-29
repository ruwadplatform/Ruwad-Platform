"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useMemo, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useModal } from "@/components/shell/ModalProvider";
import { useSession } from "@/hooks/use-store";
import { fetchBookableDates, fetchMyStartups, fetchSlots } from "@/lib/api/advisory";
import { BookingCalendar, type CalendarMonth } from "./BookingCalendar";
import { BookingReviewModal } from "./BookingReviewModal";
import { RIYADH_TZ, formatClock, formatDateUS, offsetLabel, parseYmd, riyadhDate } from "./advisory-time";
import type { AdvisorProfile } from "./advisory-types";
import { localZoneIfDifferent } from "./booking-format";
import { BOOKINGS_NOT_OPEN_NOTE } from "./booking-availability";
import { ContactRuwadLink } from "./ContactRuwadLink";
import { useAsync } from "./use-async";
import { useBookingsStatus } from "./use-bookings-status";

const MAX_DESCRIPTION = 500;

/** The booking form on the advisor profile: consultation type, date (month calendar), available time slots, startup, duration, meeting format, an
 * optional description and Continue Booking.
 *
 * Dates and slots come from the SERVER (real-time: a time someone else just took is gone), already filtered by the advisor's hours, time off,
 * the consultation's length, the two-hour notice and the 60-day horizon. Times show in Riyadh (UTC+3) by default, or in the visitor's own zone.
 * Continue Booking opens a review; nothing is booked until its Confirm succeeds on the server. */
export const BookingPanel = forwardRef<HTMLElement, {
  advisor: AdvisorProfile;
  serviceId: string;
  onServiceChange: (id: string) => void;
  flash: boolean;
}>(function BookingPanel({ advisor, serviceId, onServiceChange, flash }, ref) {
  const { openModal } = useModal();
  const { loggedIn } = useSession();
  const bookings = useBookingsStatus();
  const ids = { type: useId(), date: useId(), desc: useId(), calendar: useId(), startup: useId() };
  const [now] = useState(() => new Date());
  const today = useMemo(() => riyadhDate(now), [now]);
  const service = advisor.services.find((s) => s.id === serviceId) ?? advisor.services[0];

  const [tick, setTick] = useState(0); // bumped after a booking or a "slot taken" answer, to refetch what's on offer
  const [pickedDate, setPickedDate] = useState("");
  const [pickedStart, setPickedStart] = useState("");
  const [description, setDescription] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<CalendarMonth | null>(null);
  const [localTz, setLocalTz] = useState<string | null>(null);
  const [tzMode, setTzMode] = useState<"riyadh" | "local">("riyadh");
  const [startupPick, setStartupPick] = useState("");

  useEffect(() => { setLocalTz(localZoneIfDifferent()); }, []);

  const datesRes = useAsync(service ? `dates|${advisor.id}|${service.id}|${tick}` : null, () => fetchBookableDates(advisor.id, service!.id));
  const available = useMemo(() => new Set(datesRes.data?.dates ?? []), [datesRes.data]);
  const firstDate = useMemo(() => [...available].sort()[0] ?? "", [available]);
  // A chosen date stays only while it still has slots for this consultation type; otherwise the first open date is used.
  const dateKey = available.has(pickedDate) ? pickedDate : firstDate;
  const slotsRes = useAsync(service && dateKey ? `slots|${advisor.id}|${service.id}|${dateKey}|${tick}` : null, () => fetchSlots(advisor.id, service!.id, dateKey));
  const slots = slotsRes.data?.slots ?? [];
  const slot = slots.find((s) => s.startsAt === pickedStart) ?? null;

  const startupsRes = useAsync(loggedIn ? "startups" : null, fetchMyStartups);
  const startups = startupsRes.data ?? [];
  const startup = startups.find((s) => s.id === startupPick) ?? startups[0] ?? null;
  const contactWhen = slot ? `${formatDateUS(riyadhDate(new Date(slot.startsAt)))} · ${formatClock(new Date(slot.startsAt), RIYADH_TZ)} (${offsetLabel(new Date(slot.startsAt), RIYADH_TZ)}), Riyadh time` : null;

  const shownMonth: CalendarMonth = viewMonth ?? (dateKey ? { y: parseYmd(dateKey).y, m: parseYmd(dateKey).m } : { y: today.y, m: today.m });
  const zone = tzMode === "local" && localTz ? localTz : RIYADH_TZ;
  const zoneText = zone === RIYADH_TZ ? `Riyadh (${offsetLabel(now, RIYADH_TZ)})` : `${zone.replace(/_/g, " ")} (${offsetLabel(now, zone)})`;
  const datesLoading = datesRes.loading;
  const noStartup = loggedIn && !startupsRes.loading && !startupsRes.error && startups.length === 0;

  function chooseDate(key: string) {
    setPickedDate(key);
    setPickedStart("");
    setCalOpen(false);
  }

  function continueBooking() {
    if (!slot || !dateKey || !service) return;
    if (loggedIn && !startup) return;
    openModal(
      <BookingReviewModal
        draft={{ advisor, service, startup: loggedIn ? startup : null, startsAt: slot.startsAt, description, timeZone: zone }}
        onBooked={() => { setPickedStart(""); setDescription(""); setTick((t) => t + 1); }}
        onSlotTaken={() => { setPickedStart(""); setTick((t) => t + 1); }}
      />,
      "wide",
    );
  }

  if (!service) {
    return (
      <section ref={ref} className="adv-booking panel panel-pad" aria-label="Book a consultation" id="book">
        <h2 className="adv-booking-title">Book a Consultation</h2>
        <p className="adv-noslots" role="status">This advisor hasn&apos;t set up any consultation services yet.</p>
      </section>
    );
  }

  return (
    <section ref={ref} className={`adv-booking panel panel-pad${flash ? " is-flash" : ""}`} aria-label="Book a consultation" id="book">
      <h2 className="adv-booking-title">Book a Consultation</h2>
      <p className="adv-booking-sub">Select your preferred consultation type, date and time.</p>

      <div className="adv-bfield">
        <label htmlFor={ids.type}>Consultation type</label>
        <select id={ids.type} className="select" value={service.id} onChange={(e) => { onServiceChange(e.target.value); setPickedDate(""); setPickedStart(""); }}>
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
          <span>{datesLoading ? "Loading dates…" : dateKey ? formatDateUS(parseYmd(dateKey)) : "No dates available"}</span>
          <RuwadIcon name="chevron" size={14} style={{ transform: calOpen ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
        {datesRes.error && (
          <p className="adv-noslots adv-error" role="alert">
            Couldn&apos;t load this advisor&apos;s dates. {datesRes.error} <button type="button" className="btn btn-outline btn-sm" onClick={() => setTick((t) => t + 1)}>Try again</button>
          </p>
        )}
        {calOpen && (
          <div id={ids.calendar}>
            <BookingCalendar month={shownMonth} onMonthChange={setViewMonth} selected={dateKey} available={available} today={today} onSelect={chooseDate} />
          </div>
        )}
      </div>

      <div className="adv-bfield">
        <div className="adv-slots-head">
          <b>Available time slots</b>
          <span className="adv-zone">{zoneText}</span>
        </div>
        {localTz && (
          <div className="seg-tabs adv-tz" role="group" aria-label="Time zone">
            <button type="button" className={tzMode === "riyadh" ? "active" : ""} aria-pressed={tzMode === "riyadh"} onClick={() => setTzMode("riyadh")}>Riyadh time</button>
            <button type="button" className={tzMode === "local" ? "active" : ""} aria-pressed={tzMode === "local"} onClick={() => setTzMode("local")}>My time zone</button>
          </div>
        )}
        {slotsRes.error ? (
          <p className="adv-noslots adv-error" role="alert">
            Couldn&apos;t load the times. {slotsRes.error} <button type="button" className="btn btn-outline btn-sm" onClick={() => setTick((t) => t + 1)}>Try again</button>
          </p>
        ) : datesLoading || slotsRes.loading ? (
          <p className="adv-noslots" role="status">Loading available times…</p>
        ) : slots.length === 0 ? (
          <p className="adv-noslots" role="status">
            {firstDate ? "No time slots are available on this date. Please choose another date." : "This advisor has no open time in the next 60 days for this consultation type. Please check back later or choose another consultation type."}
          </p>
        ) : (
          <div className="adv-slots" role="group" aria-label={`Time slots on ${formatDateUS(parseYmd(dateKey))}`}>
            {slots.map((s) => (
              <button key={s.startsAt} type="button" className={`adv-slot${s.startsAt === slot?.startsAt ? " is-selected" : ""}`} aria-pressed={s.startsAt === slot?.startsAt} onClick={() => setPickedStart(s.startsAt)}>
                {formatClock(new Date(s.startsAt), zone)}
              </button>
            ))}
          </div>
        )}
      </div>

      <dl className="adv-summary">
        <div><dt>Duration</dt><dd>{service.minutes} minutes</dd></div>
        <div><dt>Format</dt><dd>Online via RUWĀD</dd></div>
        <div><dt>Selected time</dt><dd>{slot ? `${formatDateUS(parseYmd(dateKey))} · ${formatClock(new Date(slot.startsAt), zone)}` : "Choose a time"}</dd></div>
      </dl>

      {loggedIn && (
        <div className="adv-bfield">
          <label htmlFor={ids.startup}>Booking for</label>
          {startupsRes.loading ? (
            <p className="adv-noslots" role="status">Loading your startups…</p>
          ) : startupsRes.error ? (
            <p className="adv-noslots adv-error" role="alert">Couldn&apos;t load your startups. {startupsRes.error}</p>
          ) : noStartup ? (
            <p className="adv-noslots" role="status">
              To book, you need to be an owner or admin of a startup on RUWĀD. <Link href="/workspace/startup">Go to My Startup</Link>
            </p>
          ) : (
            <select id={ids.startup} className="select" value={startup?.id ?? ""} onChange={(e) => setStartupPick(e.target.value)}>
              {startups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      )}

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

      <button type="button" className="btn btn-primary btn-block btn-lg adv-continue" disabled={!slot || (loggedIn && !startup)} onClick={continueBooking}>
        Continue Booking <RuwadIcon name="arrow" size={16} />
      </button>
      <p className="adv-booking-foot">
        {bookings !== "open"
          ? <>{BOOKINGS_NOT_OPEN_NOTE} <ContactRuwadLink className="adv-contact-link" details={{ advisorName: advisor.name, serviceName: service.name, when: contactWhen }}>Contact RUWĀD</ContactRuwadLink></>
          : advisor.isDemo
            ? "Demonstration advisor: a request is recorded as a demonstration and no email is sent."
            : "Your request goes to the advisor for approval. The time is held for you while they decide. Nothing is charged."}
      </p>
    </section>
  );
});
