"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-store";

/** The root address used to open straight onto the Dashboard for everyone. Signed-in members still go there; search engines and visitors who aren't signed in stay on the
 * home page, which is real, readable content. Renders nothing. */
export function MemberRedirect() {
  const { loggedIn, hydrated } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (hydrated && loggedIn) router.replace("/dashboard");
  }, [hydrated, loggedIn, router]);
  return null;
}
