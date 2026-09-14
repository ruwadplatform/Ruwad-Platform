import { api } from "./client";
import type { ApiIntroduction } from "./types";

export function fetchIntroductions(): Promise<ApiIntroduction[]> {
  return api.get<ApiIntroduction[]>("/introductions");
}

export function createIntroduction(input: { investor?: string; startup?: string; reasonType?: string; reason?: string; message?: string }): Promise<ApiIntroduction> {
  return api.post<ApiIntroduction>("/introductions", input);
}
