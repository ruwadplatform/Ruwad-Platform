"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { ListingStatusBadge } from "./ListingStatusBadge";
import { resolveEntity, KIND_LABELS, KIND_LOGO_STYLE } from "@/lib/entity-resolve";
import { completenessFor, completenessPercent } from "@/lib/completeness";
import { useResolveCollections } from "@/hooks/use-directory-data";
import type { Listing } from "@/lib/store";

export function ListingCard({ listing }: { listing: Listing }) {
  const router = useRouter();
  const collections = useResolveCollections();
  const entity = resolveEntity(listing.type, listing.id, collections);
  if (!entity) return null;
  const pct = completenessPercent(completenessFor(listing.type, entity));

  return (
    <div className="panel panel-pad">
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="flex" style={{ gap: 12 }}>
          <div className="elogo avatar avatar-sq" style={{ width: 42, height: 42, ...KIND_LOGO_STYLE[listing.type] }}>{entity.logo}</div>
          <div>
            <b className="fs-13">{entity.name}</b>
            <div className="small muted mt-4">{KIND_LABELS[listing.type]} · {entity.subtitle}</div>
          </div>
        </div>
        <ListingStatusBadge status={listing.status} />
      </div>

      <div className="stat-mini-row mt-16">
        <div className="stat-mini"><div className="sm-label">Visibility</div><div className="sm-val fs-15">{listing.visibility}</div></div>
        <div className="stat-mini"><div className="sm-label">Last Updated</div><div className="sm-val fs-15">{listing.lastUpdated}</div></div>
        <div className="stat-mini"><div className="sm-label">Completeness</div><div className="sm-val fs-15">{pct}%</div></div>
        <div className="stat-mini"><div className="sm-label">Views</div><div className="sm-val fs-15">{listing.views.toLocaleString()}</div></div>
      </div>

      <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-outline btn-sm" onClick={() => router.push(entity.href)}><RuwadIcon name="globe" size={13} /> View</button>
        {listing.type === "startups" && <button className="btn btn-outline btn-sm" onClick={() => router.push("/workspace/startup")}><RuwadIcon name="edit" size={13} /> Manage</button>}
        <button className="btn btn-outline btn-sm" onClick={() => router.push(entity.href)}><RuwadIcon name="user" size={13} /> Preview</button>
      </div>
    </div>
  );
}
