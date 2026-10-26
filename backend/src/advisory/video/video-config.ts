/** Video settings from the environment. The provider is "mock" (simulated rooms) unless ADVISORY_VIDEO_PROVIDER is exactly "daily" AND both
 * DAILY_API_KEY and DAILY_DOMAIN are present; "daily" without credentials is reported as NOT configured, never silently downgraded to a fake
 * that people might mistake for a real meeting. */

export interface VideoConfig {
  /** What was asked for. */
  requested: "mock" | "daily";
  /** Whether it can actually be used: always true for mock; for daily only with credentials. */
  configured: boolean;
  dailyApiKey: string;
  dailyDomain: string;
  dailyApiBase: string;
  timeoutMs: number;
  /** People can join this many minutes before the start… */
  opensBeforeMinutes: number;
  /** …and until this many minutes after the end (the room and every token expire then). */
  closesAfterMinutes: number;
  maxParticipants: number;
  /** A room is deleted this long after it closed. */
  cleanupAfterMinutes: number;
}

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function readVideoConfig(get: (key: string) => string | undefined): VideoConfig {
  const requested = get("ADVISORY_VIDEO_PROVIDER")?.trim() === "daily" ? "daily" : "mock";
  const dailyApiKey = (get("DAILY_API_KEY") ?? "").trim();
  const dailyDomain = (get("DAILY_DOMAIN") ?? "").trim();
  return {
    requested,
    configured: requested === "mock" || (dailyApiKey !== "" && dailyDomain !== ""),
    dailyApiKey,
    dailyDomain,
    dailyApiBase: (get("DAILY_API_BASE") ?? "https://api.daily.co/v1").replace(/\/+$/, ""),
    timeoutMs: num(get("ADVISORY_VIDEO_TIMEOUT_MS"), 8000, 1000, 30000),
    opensBeforeMinutes: num(get("ADVISORY_MEETING_OPENS_MINUTES"), 10, 1, 60),
    closesAfterMinutes: num(get("ADVISORY_MEETING_CLOSES_MINUTES"), 15, 1, 120),
    maxParticipants: num(get("ADVISORY_MEETING_MAX_PARTICIPANTS"), 4, 2, 10),
    cleanupAfterMinutes: num(get("ADVISORY_MEETING_CLEANUP_MINUTES"), 60, 5, 24 * 60),
  };
}
