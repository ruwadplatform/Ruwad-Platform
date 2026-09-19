"use client";

import { useState, type CSSProperties } from "react";
import { initials } from "@/lib/scoring";
import { logoUrl } from "@/lib/api/uploads";

/** The one avatar used everywhere a signed-in user is shown (header, account
 * dropdown, My Profile). Shows the profile photo when there is one, cropped
 * square-to-circle with object-fit: cover; otherwise — or if the image fails
 * to load — the user's initials. `failedId` remembers *which* image failed,
 * so uploading a new photo (a new id) is attempted again automatically. */
export function UserAvatar({ user, size, className = "", style }: {
  user: { firstName: string; lastName: string; profileImageId?: string | null } | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  const imageId = user?.profileImageId ?? null;
  const src = imageId && failedId !== imageId ? logoUrl(imageId) : null;
  const text = user ? initials(`${user.firstName} ${user.lastName}`) : "?";
  const dims: CSSProperties = size ? { width: size, height: size, fontSize: Math.round(size * 0.38) } : {};

  return (
    <span className={`user-avatar ${className}`.trim()} style={{ ...dims, ...style }}>
      {src ? <img src={src} alt="" draggable={false} onError={() => setFailedId(imageId)} /> : text}
    </span>
  );
}
