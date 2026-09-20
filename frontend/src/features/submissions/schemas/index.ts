import type { ApiSubmissionKind } from "@/lib/api/types";
import type { EntitySchema } from "../schema-types";
import { startupSchema } from "./startup";
import { investorSchema } from "./investor";
import { hubSchema, hubSchemaFor } from "./hub";
import { researchSchema } from "./research";
import { multinationalSchema } from "./multinational";

export const SCHEMAS: Record<ApiSubmissionKind, EntitySchema> = {
  STARTUP: startupSchema,
  INVESTOR: investorSchema,
  HUB: hubSchema,
  RESEARCH: researchSchema,
  MULTINATIONAL: multinationalSchema,
};

/** The schema to render for a submission. Static for every kind except HUB,
 * whose steps depend on the selected Type in the payload. */
export function schemaFor(kind: ApiSubmissionKind, payload?: Record<string, unknown> | null): EntitySchema {
  return kind === "HUB" ? hubSchemaFor(payload?.type) : SCHEMAS[kind];
}

export const ROUTE_TO_KIND: Record<string, ApiSubmissionKind> = Object.fromEntries(
  Object.values(SCHEMAS).map((s) => [s.route, s.kind]),
) as Record<string, ApiSubmissionKind>;

export { startupSchema, investorSchema, hubSchema, researchSchema, multinationalSchema };
