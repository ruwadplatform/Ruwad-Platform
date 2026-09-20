import type { EntitySchema, FieldDef, StepDef } from "./schema-types";

type Payload = Record<string, unknown>;

export function fieldError(field: FieldDef, value: unknown, payload: Payload): string | undefined {
  if (field.condition && !field.condition(payload)) return undefined;

  if (field.required) {
    if (field.type === "chips" || field.type === "string-array" || field.type === "document-checklist") {
      if (!Array.isArray(value) || value.length === 0) return "This field is required.";
    } else if (field.type === "number") {
      if (value === undefined || value === null || value === "") return "This field is required.";
    } else if (field.type !== "boolean") {
      if (!value || (typeof value === "string" && !value.trim())) return "This field is required.";
    }
  }

  if (field.type === "number" && typeof value === "number") {
    if (field.min !== undefined && value < field.min) return `Must be at least ${field.min}.`;
    if (field.max !== undefined && value > field.max) return `Must be at most ${field.max}.`;
  }
  if (field.maxLength && typeof value === "string" && value.length > field.maxLength) {
    return `Must be ${field.maxLength} characters or fewer.`;
  }
  return undefined;
}

export interface RepeaterErrors {
  [itemIndex: number]: Record<string, string>;
}

export function repeaterItemErrors(field: FieldDef, items: Payload[]): RepeaterErrors {
  const out: RepeaterErrors = {};
  if (!field.itemFields) return out;
  items.forEach((item, i) => {
    const itemErrs: Record<string, string> = {};
    for (const sub of field.itemFields!) {
      const err = fieldError(sub, item[sub.name], item);
      if (err) itemErrs[sub.name] = err;
    }
    if (Object.keys(itemErrs).length) out[i] = itemErrs;
  });
  return out;
}

export interface StepValidation {
  fieldErrors: Record<string, string>;
  repeaterErrors: Record<string, RepeaterErrors>;
  valid: boolean;
}

export function validateStep(step: StepDef, payload: Payload): StepValidation {
  const fieldErrors: Record<string, string> = {};
  const repeaterErrors: Record<string, RepeaterErrors> = {};
  for (const section of step.sections) {
    for (const f of section.fields) {
      if (f.type === "repeater") {
        const items = Array.isArray(payload[f.name]) ? (payload[f.name] as Payload[]) : [];
        const errs = repeaterItemErrors(f, items);
        if (Object.keys(errs).length) repeaterErrors[f.name] = errs;
        continue;
      }
      const err = fieldError(f, payload[f.name], payload);
      if (err) fieldErrors[f.name] = err;
    }
  }
  return { fieldErrors, repeaterErrors, valid: Object.keys(fieldErrors).length === 0 && Object.keys(repeaterErrors).length === 0 };
}

export function validateSchema(schema: EntitySchema, payload: Payload): boolean {
  return schema.steps.every((step) => validateStep(step, payload).valid);
}

/** Rough client-side completeness estimate for the progress bar/badge —
 * counts required top-level fields with a non-empty value. The backend's
 * own DTO re-validation at submit/approve time remains the authoritative
 * check; this is UX only. */
export function completionPercentage(schema: EntitySchema, payload: Payload): number {
  let total = 0;
  let done = 0;
  for (const step of schema.steps) {
    for (const section of step.sections) {
      for (const f of section.fields) {
        if (f.type === "repeater" || !f.required) continue;
        if (f.condition && !f.condition(payload)) continue; // hidden fields never count
        total += 1;
        if (!fieldError(f, payload[f.name], payload)) done += 1;
      }
    }
  }
  return total === 0 ? 100 : Math.round((done / total) * 100);
}
