import type { EntitySchema, FieldDef } from "./schema-types";

/** Fields a live listing cannot be saved without; everything else may be left blank while the owner fills in more over time. */
export const EDIT_CORE_FIELDS: readonly string[] = ["name", "category", "tagline", "country", "city", "stage"];

/** The submission form, relaxed for editing a startup that is already live: only the core identity fields stay required and no repeater needs a
 * minimum number of entries. A row the owner does add (a team member, a funding round) still has to be complete. The shape and field names are
 * untouched, so the same step components render it and the payload keeps the submission format. */
export function relaxForEdit(schema: EntitySchema): EntitySchema {
  const relax = (f: FieldDef): FieldDef => ({ ...f, required: EDIT_CORE_FIELDS.includes(f.name) ? f.required : false, minItems: undefined });
  return { ...schema, steps: schema.steps.map((st) => ({ ...st, sections: st.sections.map((sec) => ({ ...sec, fields: sec.fields.map(relax) })) })) };
}
