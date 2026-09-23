"use client";

import { useEffect, useRef, useState } from "react";

/** One logo box, used everywhere a startup/investor/hub/research institution/multinational
 * appears: a real uploaded logo when the entity has one, contained (never stretched or
 * cropped) on a white background — falling back to the backend-computed colored initials,
 * including when a stored logo URL fails to load, so a broken image never shows a broken-image
 * icon. The box itself (size, shape, corner radius, the initials-state background color) is
 * whatever the caller's className already gives it (`.plogo` / `.elogo` / `.row-logo`) — this
 * only decides what goes inside that box. */
export function OrganizationLogo({ logo, logoUrl, className, style }: {
  /** The backend-computed initials (e.g. "NA") shown while there's no logo, or if it fails to load. */
  logo: string;
  logoUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // On a server-rendered page the browser can start loading (and failing) the <img> from the raw
  // HTML before React hydrates and attaches onError, so that error event is missed entirely — check
  // once on mount whether it already failed, on top of the ordinary onError for a later failure.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [logoUrl]);
  if (logoUrl && !broken) {
    return (
      <div className={className} style={{ ...style, padding: 4, background: "#fff", overflow: "hidden" }}>
        <img ref={imgRef} src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={() => setBroken(true)} />
      </div>
    );
  }
  return <div className={className} style={style}>{logo}</div>;
}
