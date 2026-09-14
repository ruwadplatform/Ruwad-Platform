"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";

/** Ported verbatim from directoryGateBannerHtml() (js/auth-gate.js:73-83). */
export function DirectoryGateBanner({ entityLabelPlural, totalCount }: { entityLabelPlural: string; totalCount: number }) {
  const router = useRouter();
  return (
    <div className="directory-gate">
      <div className="dg-icon"><RuwadIcon name="lock" size={22} /></div>
      <h3>Unlock the complete RUWĀD {entityLabelPlural} ecosystem</h3>
      <p className="muted small">Create a free account to explore all {totalCount}+ {entityLabelPlural.toLowerCase()}, advanced filters, investor intelligence and analytics.</p>
      <div className="dg-actions">
        <button className="btn btn-primary btn-lg" onClick={() => router.push("/signup")}>Create Free Account</button>
        <button className="btn btn-outline btn-lg" onClick={() => router.push("/login")}>Sign In</button>
      </div>
    </div>
  );
}
