"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hydrateSession, subscribeViewerChange } from "@/lib/store";

/** Checks the real backend session (the httpOnly auth cookie) once on app
 * load — this is what keeps a page refresh logged in, since there's no
 * synchronous localStorage session to read anymore. Starts unauthenticated
 * (user = null) until this resolves; there is no automatic or default
 * login. */
export function AppBoot() {
  const router = useRouter();
  useEffect(() => {
    hydrateSession();
  }, []);
  // Pages rendered on the server were built for whoever was signed in at the time; sign in, register or sign out and they are rendered again for the new viewer.
  useEffect(() => subscribeViewerChange(() => router.refresh()), [router]);
  return null;
}
