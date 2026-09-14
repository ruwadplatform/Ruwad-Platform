"use client";

import { RuwadIcon } from "@/components/icons/ruwad-icon";
import { Field, type FieldValue } from "./Field";
import type { FieldDef } from "./schema-types";

type ItemRecord = Record<string, unknown>;

interface RepeaterProps {
  field: FieldDef;
  items: ItemRecord[];
  errors?: Record<number, Record<string, string>>;
  onChange: (items: ItemRecord[]) => void;
}

/** Add/Edit/Remove/Reorder for array-of-object fields (team members,
 * funding rounds, programs, projects, ...) — one shared component instead
 * of a bespoke repeater per entity type, per the "reusable repeatable-field
 * components" requirement. Built against the pre-existing .repeater-card
 * CSS shell. */
export function Repeater({ field, items, errors, onChange }: RepeaterProps) {
  const itemFields = field.itemFields ?? [];
  const atMax = field.maxItems ? items.length >= field.maxItems : false;

  function addItem() {
    if (atMax) return;
    onChange([...items, {}]);
  }
  function removeItem(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function updateItemField(i: number, name: string, value: ItemRecord[string]) {
    const next = [...items];
    next[i] = { ...next[i], [name]: value };
    onChange(next);
  }

  return (
    <div className={`field${field.full ? " field-full" : ""}`}>
      <label>{field.label}</label>
      {items.map((item, i) => (
        <div className="repeater-card" key={i}>
          <button type="button" className="rc-remove" aria-label={`Remove ${field.itemLabel ?? "item"}`} onClick={() => removeItem(i)}>
            <RuwadIcon name="trash" size={14} />
          </button>
          <div className="flex gap-8 mb-8" style={{ alignItems: "center" }}>
            <b className="small">{field.itemLabel ?? "Item"} {i + 1}</b>
            {items.length > 1 && (
              <div className="flex gap-4" style={{ marginLeft: "auto", marginRight: 28 }}>
                <button type="button" className="btn btn-outline btn-xs" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-outline btn-xs" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Move down">↓</button>
              </div>
            )}
          </div>
          <div className="grid-2">
            {itemFields.map((sub) => (
              <Field
                key={sub.name}
                field={sub}
                value={item[sub.name] as FieldValue}
                error={errors?.[i]?.[sub.name]}
                onChange={(v) => updateItemField(i, sub.name, v)}
              />
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" disabled={atMax} onClick={addItem}>
        <RuwadIcon name="plus" size={13} /> Add {field.itemLabel ?? "Item"}
      </button>
    </div>
  );
}
