"use client";

import { useEffect } from "react";
import { hydrateSession } from "@/lib/store";

/** Checks the real backend session (the httpOnly auth cookie) once on app
 * load — this is what keeps a page refresh logged in, since there's no
 * synchronous localStorage session to read anymore. Starts unauthenticated
 * (user = null) until this resolves; there is no automatic or default
 * login. */
export function AppBoot() {
  useEffect(() => {
    hydrateSession();
  }, []);
  return null;
}
