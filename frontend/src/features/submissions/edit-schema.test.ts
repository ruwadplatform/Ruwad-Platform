import { test } from "node:test";
import assert from "node:assert/strict";
import { relaxForEdit } from "./edit-schema.ts";
import { validateSchema } from "./validate.ts";

const schema = {
  kind: "STARTUP", label: "x", route: "x", description: "x", icon: "x",
  steps: [{
    id: "a", label: "A", sections: [{ fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "annualRevenue", label: "Revenue", type: "number", required: true },
      { name: "founders", label: "Team", type: "repeater", minItems: 1, itemFields: [{ name: "name", label: "Name", type: "text", required: true }] },
    ] }],
  }],
} as never;

test("editing keeps the core identity fields required but not the rest", () => {
  const relaxed = relaxForEdit(schema);
  assert.equal(validateSchema(relaxed, {}), false); // no name
  assert.equal(validateSchema(relaxed, { name: "Acme" }), true); // no revenue and no team is fine on an edit
});

test("a team member row that is added still has to be complete", () => {
  const relaxed = relaxForEdit(schema);
  assert.equal(validateSchema(relaxed, { name: "Acme", founders: [{ name: "" }] }), false);
  assert.equal(validateSchema(relaxed, { name: "Acme", founders: [{ name: "Sara" }] }), true);
});

test("the original schema is not mutated", () => {
  relaxForEdit(schema);
  assert.equal(validateSchema(schema, { name: "Acme" }), false);
});
