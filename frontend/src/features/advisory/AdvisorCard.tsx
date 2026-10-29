"use client";

import Link from "next/link";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { formatSlot, type NextSlot } from "./advisory-availability";
import type { AdvisorSummary, ViewMode } from "./advisory-types";
import { useBookingsStatus } from "./use-bookings-status";

/** A placeholder avatar: the advisor's initials on a tinted square. The demonstration advisors have no photographs, and none are implied. */
export function AdvisorAvatar({ name, size = 72 }: { name: string; size?: number }) {
  const letters = name.replace(/^(dr|prof)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className="adv-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }} aria-hidden="true">
      {letters}
    </span>
  );
}

export function advisorHref(id: string): string {
  return `/discover/advisory-services/${encodeURIComponent(id)}`;
}

/** One advisor in the directory — the same content in the grid and in the list view. */
export function AdvisorCard({ advisor, view, nextSlot }: { advisor: AdvisorSummary; view: ViewMode; nextSlot: NextSlot | null }) {
  const bookings = useBookingsStatus(); // "View & Book" is only promised once the server has opened booking
  return (
    <article className={`adv-card panel${view === "list" ? " is-list" : ""}`} aria-label={advisor.name}>
      <div className="adv-card-main">
        <AdvisorAvatar name={advisor.name} />
        <div className="adv-card-body">
          <h3 className="adv-name">{advisor.name}</h3>
          <div className="adv-inst">{advisor.institution}</div>
          <div className="adv-tags">
            <span className="adv-tag">{advisor.specialization}</span>
            {advisor.isDemo && <span className="adv-demo" title="A fictional demonstration profile — not a real person">Demo profile</span>}
          </div>
        </div>
      </div>
      <p className="adv-expertise">{advisor.expertise}</p>
      <div className={`adv-avail${nextSlot ? " is-open" : ""}`}>
        <RuwadIcon name="clock" size={14} /> {nextSlot ? <>Available · <span className="adv-next">Next {formatSlot(nextSlot)}</span></> : "No upcoming availability"}
      </div>
      <div className="adv-foot">
        <div className="adv-meta">
          {advisor.yearsExperience != null && (
            <span className="adv-meta-item"><RuwadIcon name="user" size={14} /> {advisor.yearsExperience}+ years</span>
          )}
        </div>
        <Link href={advisorHref(advisor.id)} className="btn btn-outline adv-cta" aria-label={bookings === "open" ? `View ${advisor.name} and book a consultation` : `View ${advisor.name}`}>
          {bookings === "open" ? <>View &amp; Book</> : "View profile"} <RuwadIcon name="arrow" size={14} />
        </Link>
      </div>
    </article>
  );
}
