"use client";

import { useEffect } from "react";
import { hydrateSession } from "@/lib/store";

/** Checks the real backend session (the httpOnly auth cookie) once on app
 * load — this is what keeps a page refresh logged in, since there's no
 * synchronous localStorage session to read anymore. The demo/admin
 * accounts and demo workspace content are now seeded server-side (see
 * ruwad-backend's seed script), not created here. */
export function AppBoot() {
  useEffect(() => {
    hydrateSession();
  }, []);
  return null;
}
