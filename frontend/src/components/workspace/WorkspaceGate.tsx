"use client";

import { useRouter, usePathname } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { stashReturnRoute } from "@/lib/store";

/** Full-page equivalent of DirectoryGateBanner (same `.directory-gate`/
 * `.dg-icon`/`.dg-actions` markup and CSS — js/auth-gate.js's visual
 * language) for a Workspace route a guest navigated to directly. Workspace
 * itself is authenticated-only, so this stands in place of the page
 * content rather than capping a list. Stashes the current route first so
 * a successful login/signup returns the visitor here instead of always
 * landing on /dashboard. */
export function WorkspaceGate({ title = "Sign in to access your Workspace", body = "Your Workspace holds your watchlist, saved searches, introduction requests and company listings. Sign in or create a free account to continue." }: { title?: string; body?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function goTo(dest: "/login" | "/signup") {
    stashReturnRoute(pathname);
    router.push(dest);
  }

  return (
    <div className="directory-gate">
      <div className="dg-icon"><RuwadIcon name="lock" size={22} /></div>
      <h3>{title}</h3>
      <p className="muted small">{body}</p>
      <div className="dg-actions">
        <button className="btn btn-primary btn-lg" onClick={() => goTo("/signup")}>Create Free Account</button>
        <button className="btn btn-outline btn-lg" onClick={() => goTo("/login")}>Sign In</button>
      </div>
    </div>
  );
}
