import { logoUrl } from "@/lib/api/uploads";
import type { EntitySchema, FieldDef } from "./schema-types";

type Payload = Record<string, unknown>;

export function formatValue(field: FieldDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (field.type === "repeater") return `${value.length} ${field.itemLabel ?? "item"}${value.length === 1 ? "" : "s"}`;
    return (value as unknown[]).join(", ") || "—";
  }
  return String(value);
}

/** Read-only grouped-by-step rendering of a submission payload — shared by
 * the user-facing submission detail page and the admin review page so the
 * two never drift into separate "what does this payload mean" logic. */
export function PayloadSummary({ schema, payload }: { schema: EntitySchema; payload: Payload }) {
  return (
    <div>
      {schema.steps.map((step) => (
        <div className="form-section-block" key={step.id}>
          <h4>{step.label}</h4>
          {step.sections.map((section, si) => (
            <div key={si} className="stat-mini-row mb-12">
              {section.fields.filter((f) => !f.condition || f.condition(payload)).map((f) => {
                if (f.type === "image-upload") {
                  const url = logoUrl(payload[f.name] as string | undefined);
                  return (
                    <div className="stat-mini" key={f.name}>
                      <div className="sm-label">{f.label}</div>
                      {url ? <img src={url} alt={f.label} style={{ width: 40, height: 40, borderRadius: "var(--radius-card)", objectFit: "contain", background: "#fff", marginTop: 4 }} /> : <div className="sm-val fs-15">—</div>}
                    </div>
                  );
                }
                return (
                  <div className="stat-mini" key={f.name}>
                    <div className="sm-label">{f.label}</div>
                    <div className="sm-val fs-15">{formatValue(f, payload[f.name])}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
