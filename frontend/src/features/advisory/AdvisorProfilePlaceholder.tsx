"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/EmptyState";
import { fetchAdvisor } from "@/lib/api/advisory";
import { AdvisorAvatar } from "./AdvisorCard";
import { Breadcrumbs } from "./AdvisoryServicesPage";
import type { AdvisorSummary } from "./advisory-types";

/** PHASE 1 stand-in for `/discover/advisory-services/[advisorId]`. "View & Book" already lands here, so the route is final; the full profile
 * (tabs, services, availability calendar) and booking arrive in the next phase and will replace this component. */
export function AdvisorProfilePlaceholder({ advisorId }: { advisorId: string }) {
  const [advisor, setAdvisor] = useState<AdvisorSummary | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAdvisor(advisorId).then((a) => { if (alive) setAdvisor(a); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [advisorId]);

  if (failed) return <ErrorState title="Couldn't load this advisor" body="Please try again in a moment." />;
  if (advisor === undefined) return <LoadingState title="Loading advisor…" />;
  if (advisor === null) {
    return <EmptyState icon="search" title="Advisor not found" body="This advisor isn't in the directory." action={<Link className="btn btn-outline" href="/discover/advisory-services">Back to Advisory Services</Link>} />;
  }

  return (
    <div className="advisory-page">
      <Breadcrumbs items={[{ label: "Discover" }, { label: "Advisory Services", href: "/discover/advisory-services" }, { label: advisor.name }]} />
      <section className="adv-hero panel">
        <AdvisorAvatar name={advisor.name} size={88} />
        <div className="adv-hero-text">
          <h1 className="adv-profile-name">{advisor.name}</h1>
          <p className="muted small">{advisor.institution} · {advisor.specialization}</p>
          {advisor.isDemo && <span className="adv-demo">Demo profile</span>}
        </div>
      </section>
      <section className="panel panel-pad adv-soon">
        <h3 className="fs-14">Full profile and booking are coming next</h3>
        <p className="muted small mt-8">This advisor&apos;s profile, consultation services, availability calendar and booking arrive in the next phase of Advisory Services.</p>
        <Link className="btn btn-outline mt-16" href="/discover/advisory-services"><RuwadIcon name="arrow" size={14} style={{ transform: "rotate(180deg)" }} /> Back to advisors</Link>
      </section>
    </div>
  );
}
