"use client";

import { useRouter } from "next/navigation";
import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { useSession } from "@/hooks/use-store";

/** Ported from stuDataRoomTab()/invDataRoomTab()'s guest branch
 * (js/dataroom.js:511-521) verbatim. The authenticated branch there pulls
 * in the full Data Room state machine (request/sign/access, ~1000 lines)
 * which is a later phase — logged-in users see an honest "not built yet"
 * panel in the same visual language instead of a fabricated NDA flow. */
export function DataRoomTab({ kind }: { kind: "startup" | "investor" }) {
  const { loggedIn } = useSession();
  const router = useRouter();

  if (!loggedIn) {
    return (
      <div className="panel panel-pad dr-locked-state">
        <div className="dr-lock-icon"><RuwadIcon name="lock" size={22} /></div>
        <h3 className="fs-15" style={{ marginTop: 12 }}>Sign in to request Data Room access</h3>
        <p className="muted small mt-8" style={{ maxWidth: 420, margin: "8px auto 0" }}>
          Create a free RUWĀD account or sign in to view this {kind === "startup" ? "company's pitch deck" : "investor's fund materials"} and request access to its confidential Data Room.
        </p>
        <div className="flex gap-8 mt-16" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => router.push("/login")}>Sign In</button>
          <button className="btn btn-outline" onClick={() => router.push("/signup")}>Create Account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel panel-pad">
      <p className="small muted">Data Room access requests aren&apos;t available yet — coming in a later release.</p>
    </div>
  );
}
