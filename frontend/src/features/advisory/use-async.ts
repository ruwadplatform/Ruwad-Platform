"use client";

import { useEffect, useState } from "react";
import { errText } from "./booking-format";

/** Loads something from the backend whenever `key` changes (null = don't load). The result is stored WITH the key it was fetched for, so a stale
 * answer for an earlier key is never shown for the current one: while the new key's answer is on its way, `loading` is true and `data` is
 * undefined. Include a counter in the key to force a refetch. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): { data: T | undefined; error: string | undefined; loading: boolean } {
  const [res, setRes] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    load().then((data) => { if (alive) setRes({ key, data }); }).catch((e) => { if (alive) setRes({ key, error: errText(e) }); });
    return () => { alive = false; };
    // `load` is a fresh closure every render by design; the key is what says "this is a different request".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = key !== null && res?.key === key ? res : null;
  return { data: current?.data, error: current?.error, loading: key !== null && !current };
}
