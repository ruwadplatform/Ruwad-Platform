"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon, type RuwadIconName } from "@/components/icons/ruwad-icon";
import { IntelligencePageHeader } from "@/components/intelligence/IntelligencePageHeader";
import { SCHEMAS } from "./schemas";

/** The five listing-type entry cards — guests can browse this page freely;
 * the actual gate (sign in / create account) happens on the per-type
 * wizard route, same as every other Workspace page in the app. */
export function SubmitHubPage() {
  const router = useRouter();
  return (
    <div>
      <IntelligencePageHeader
        title="Submit a Listing"
        description="Add your organization to the RUWĀD directory. Every submission is reviewed by our team before it goes live."
      />
      <div className="entity-grid mt-20">
        {Object.values(SCHEMAS).map((schema) => (
          <button
            key={schema.kind}
            type="button"
            className="panel panel-pad"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => router.push(`/submit/${schema.route}`)}
          >
            <div className="elogo avatar avatar-sq" style={{ width: 42, height: 42 }}>
              <RuwadIcon name={schema.icon as RuwadIconName} size={20} />
            </div>
            <b className="fs-15" style={{ display: "block", marginTop: 12 }}>{schema.label}</b>
            <p className="small muted mt-8">{schema.description}</p>
            <span className="small" style={{ fontWeight: 700, color: "var(--green-dark)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 12 }}>
              Get Started <RuwadIcon name="arrow" size={13} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
