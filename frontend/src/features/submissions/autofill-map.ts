import { allFields, type EntitySchema, type FieldDef } from "./schema-types";

/** Turns what the AI extracted into values the form can actually hold, using the form's OWN schema:
 * dropdown answers must match a real option, numbers respect min/max, text respects its max length,
 * and repeaters (products, team, funding rounds…) keep only the columns that exist. Anything that
 * doesn't fit is dropped — the user simply fills that field themselves. Nothing is invented here. */

const compact = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

export function matchOption(value: string, options: readonly string[]): string | undefined {
  const v = compact(value);
  if (!v) return undefined;
  const exact = options.find((o) => compact(o) === v);
  if (exact) return exact;
  // "Series C" -> "Series C+", "SaaS B2B" -> "B2B"
  const loose = options.filter((o) => { const c = compact(o); return c.length >= 3 && (v.startsWith(c) || v === c.replace(/plus$/, "")); });
  return loose.length === 1 ? loose[0] : undefined;
}

function cleanText(v: unknown, max?: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return max && t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "").trim() || t.slice(0, max) : t;
}

function coerceValue(f: FieldDef, v: unknown): unknown {
  switch (f.type) {
    case "text":
    case "textarea": return cleanText(v, f.maxLength);
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
      const n = f.name === "founded" ? Math.round(v) : v;
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return undefined;
      return n;
    }
    case "select": return typeof v === "string" && f.options ? matchOption(v, f.options) : undefined;
    case "chips": {
      if (!Array.isArray(v) || !f.options) return undefined;
      const out = [...new Set(v.map((x) => (typeof x === "string" ? matchOption(x, f.options!) : undefined)).filter((x): x is string => !!x))];
      return out.length ? out : undefined;
    }
    case "boolean": return typeof v === "boolean" ? v : undefined;
    case "string-array": {
      if (!Array.isArray(v)) return undefined;
      const out = [...new Set(v.map((x) => cleanText(x, f.maxLength ?? 150)).filter((x): x is string => !!x))];
      return out.length ? out : undefined;
    }
    case "repeater": {
      if (!Array.isArray(v) || !f.itemFields) return undefined;
      const rows = v.map((row) => {
        if (!row || typeof row !== "object") return undefined;
        const out: Record<string, unknown> = {};
        for (const sub of f.itemFields!) { const c = coerceValue(sub, (row as Record<string, unknown>)[sub.name]); if (c !== undefined) out[sub.name] = c; }
        return Object.keys(out).length ? out : undefined;
      }).filter((r): r is Record<string, unknown> => !!r).slice(0, f.maxItems ?? 50);
      return rows.length ? rows : undefined;
    }
    default: return undefined; // image-upload, document-checklist: never filled from a document
  }
}

export function coerceExtracted(schema: EntitySchema, extracted: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of allFields(schema)) {
    if (!(f.name in extracted)) continue;
    const v = coerceValue(f, extracted[f.name]);
    if (v !== undefined) out[f.name] = v;
  }
  return out;
}
