import { EntityManager } from "typeorm";
import { EntityKind } from "../../common/enums";

/** One implementation per directory entity type — maps an approved
 * submission's free-form JSONB payload onto the real normalized schema
 * and writes it, entirely through the given (transactional) EntityManager
 * so the whole approve-and-publish operation commits or rolls back as one
 * unit. Returns the new row's id for `submission.publishedEntityId`. */
export interface SubmissionPublisher {
  readonly kind: EntityKind;
  publish(manager: EntityManager, payload: Record<string, unknown>): Promise<string>;
}

/* ---------------------------------------------------------------- helpers
 * Payloads are user-submitted JSONB — every read here is defensive
 * (string()/num()/bool()/arr()) rather than trusting the shape, even
 * though submit-time validation already ran, because a payload can still
 * be missing genuinely-optional fields the form never showed. */
export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
export function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}
export function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
export function strArr(v: unknown): string[] {
  return arr(v).filter((x): x is string => typeof x === "string");
}
