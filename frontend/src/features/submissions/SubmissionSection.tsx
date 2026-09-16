import { Field, type FieldValue } from "./Field";
import { Repeater } from "./Repeater";
import type { SectionDef } from "./schema-types";
import type { RepeaterErrors } from "./validate";

type Payload = Record<string, unknown>;

/** One titled field-group block — extracted verbatim from SubmissionWizard's
 * inline .form-section-block/.grid-2 JSX (the per-step field-rendering
 * loop), reused as-is by both the normal step body and ReviewSection. */
export function SubmissionSection({ section, payload, showErrors, fieldErrors, repeaterErrors, aiFilledFields, onFieldChange }: {
  section: SectionDef;
  payload: Payload;
  showErrors: boolean;
  fieldErrors: Record<string, string>;
  repeaterErrors: Record<string, RepeaterErrors>;
  aiFilledFields: Set<string>;
  onFieldChange: (name: string, value: unknown) => void;
}) {
  return (
    <div className="form-section-block">
      {section.title && <h4>{section.title}</h4>}
      <div className="grid-2">
        {section.fields.map((f) => {
          if (f.condition && !f.condition(payload)) return null;
          if (f.type === "repeater") {
            return (
              <div key={f.name} className="field-full">
                <Repeater
                  field={f}
                  items={Array.isArray(payload[f.name]) ? (payload[f.name] as Payload[]) : []}
                  errors={showErrors ? repeaterErrors[f.name] : undefined}
                  onChange={(items) => onFieldChange(f.name, items)}
                />
              </div>
            );
          }
          return (
            <Field
              key={f.name}
              field={f}
              value={payload[f.name] as FieldValue}
              error={showErrors ? fieldErrors[f.name] : undefined}
              aiFilled={aiFilledFields.has(f.name)}
              onChange={(v) => onFieldChange(f.name, v)}
            />
          );
        })}
      </div>
    </div>
  );
}
