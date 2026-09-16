import { logoUrl } from "@/lib/api/uploads";
import { formatValue } from "./PayloadSummary";
import { validateStep } from "./validate";
import type { EntitySchema, FieldDef } from "./schema-types";

type Payload = Record<string, unknown>;

/** Replaces the old ReviewPanel (which only showed a per-step Complete/
 * Missing-fields badge). Same per-step Edit button and confirm checkbox,
 * but now also shows the actual field values (reusing PayloadSummary's
 * formatValue/image-upload logic instead of reimplementing it) and, for an
 * incomplete step, an itemized list of exactly which required fields are
 * missing/invalid instead of just a generic badge. */
export function ReviewSection({ schema, payload, onEditSection, confirmChecked, onConfirmChange }: {
  schema: EntitySchema;
  payload: Payload;
  onEditSection: (stepIndex: number) => void;
  confirmChecked: boolean;
  onConfirmChange: (v: boolean) => void;
}) {
  return (
    <div>
      {schema.steps.map((step, i) => {
        const v = validateStep(step, payload);
        const allFields = step.sections.flatMap((s) => s.fields);
        const missingNames = new Set([...Object.keys(v.fieldErrors), ...Object.keys(v.repeaterErrors)]);
        const missingLabels = allFields.filter((f) => missingNames.has(f.name)).map((f) => f.label);

        return (
          <div className="form-section-block" key={step.id}>
            <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ border: "none", marginBottom: 0, paddingBottom: 0 }}>{step.label}</h4>
              <div className="flex gap-8" style={{ alignItems: "center" }}>
                <span className={`badge ${v.valid ? "badge-good" : "badge-warn"}`}>{v.valid ? "Complete" : "Missing fields"}</span>
                <button type="button" className="btn btn-outline btn-xs" onClick={() => onEditSection(i)}>Edit</button>
              </div>
            </div>

            {!v.valid && missingLabels.length > 0 && (
              <div className="hint mb-12" style={{ color: "var(--crit)" }}>
                Missing: {missingLabels.join(", ")}
              </div>
            )}

            {step.sections.map((section, si) => (
              <div key={si} className="stat-mini-row mb-12">
                {section.fields.filter((f) => !f.condition || f.condition(payload)).map((f) => (
                  <ReviewFieldValue key={f.name} field={f} value={payload[f.name]} />
                ))}
              </div>
            ))}
          </div>
        );
      })}
      <div className="field mt-16">
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 500 }}>
          <input type="checkbox" checked={confirmChecked} onChange={(e) => onConfirmChange(e.target.checked)} style={{ marginTop: 2 }} />
          I confirm that the information provided is accurate and I am authorized to submit this listing.
        </label>
      </div>
    </div>
  );
}

function ReviewFieldValue({ field, value }: { field: FieldDef; value: unknown }) {
  if (field.type === "image-upload") {
    const url = logoUrl(value as string | undefined);
    return (
      <div className="stat-mini">
        <div className="sm-label">{field.label}</div>
        {url ? <img src={url} alt={field.label} style={{ width: 40, height: 40, borderRadius: "var(--radius-card)", objectFit: "contain", background: "#fff", marginTop: 4 }} /> : <div className="sm-val fs-15">—</div>}
      </div>
    );
  }
  return (
    <div className="stat-mini">
      <div className="sm-label">{field.label}</div>
      <div className="sm-val fs-15">{formatValue(field, value)}</div>
    </div>
  );
}
