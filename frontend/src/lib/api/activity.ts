import { api } from "./client";
import type { ApiActivity } from "./types";

export function fetchActivity(): Promise<ApiActivity[]> {
  return api.get<ApiActivity[]>("/activity");
}
