import type { ApiSubmissionKind } from "@/lib/api/types";

export type FieldType = "text" | "textarea" | "number" | "select" | "chips" | "boolean" | "string-array" | "repeater" | "document-checklist" | "image-upload";

export interface FieldDef {
  /** Payload key this field reads/writes. For repeater item sub-fields,
   * this is the key within each item object. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  /** Vocabulary for select/chips — reused from src/data/reference.ts, never
   * free text, per the submission spec. */
  options?: readonly string[];
  rows?: number;
  /** repeater only */
  itemFields?: FieldDef[];
  itemLabel?: string;
  maxItems?: number;
  full?: boolean;
  /** Shown/required only when this returns true for the current payload —
   * kept simple, no cross-step dependencies. */
  condition?: (payload: Record<string, unknown>) => boolean;
}

export interface SectionDef {
  title?: string;
  fields: FieldDef[];
}

export interface StepDef {
  id: string;
  label: string;
  sections: SectionDef[];
}

export interface EntitySchema {
  kind: ApiSubmissionKind;
  label: string;
  route: string;
  description: string;
  icon: string;
  steps: StepDef[];
}

export function allFields(schema: EntitySchema): FieldDef[] {
  const out: FieldDef[] = [];
  for (const step of schema.steps) for (const section of step.sections) out.push(...section.fields);
  return out;
}
