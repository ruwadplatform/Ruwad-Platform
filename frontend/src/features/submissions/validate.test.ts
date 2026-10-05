import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStep, completionPercentage, repeaterMinError } from "./validate.ts";

const team = {
  id: "team", label: "Team",
  sections: [{ fields: [{
    name: "founders", label: "Founders", type: "repeater" as const, itemLabel: "Team Member", minItems: 1,
    itemFields: [{ name: "name", label: "Name", type: "text" as const, required: true }],
  }] }],
};
const schema = { kind: "STARTUP", label: "x", route: "x", description: "x", icon: "x", steps: [team] } as never;

test("a repeater with minItems is invalid until an entry exists", () => {
  const v = validateStep(team, {});
  assert.equal(v.valid, false);
  assert.equal(v.fieldErrors.founders, "Add at least one team member.");
  assert.equal(validateStep(team, { founders: [] }).valid, false);
});

test("an added but blank team member is still invalid through its own required fields", () => {
  const v = validateStep(team, { founders: [{}] });
  assert.equal(v.valid, false);
  assert.equal(v.fieldErrors.founders, undefined);
  assert.deepEqual(v.repeaterErrors.founders[0], { name: "This field is required." });
});

test("a filled team member makes the step valid", () => {
  assert.equal(validateStep(team, { founders: [{ name: "Sara" }] }).valid, true);
});

test("minItems above one is pluralised", () => {
  assert.equal(repeaterMinError({ ...team.sections[0].fields[0], minItems: 2 }, [{}]), "Add at least 2 team members.");
});

test("completion counts the team requirement", () => {
  assert.equal(completionPercentage(schema, {}), 0);
  assert.equal(completionPercentage(schema, { founders: [{ name: "Sara" }] }), 100);
});

// The real wizard schema imports through the "@/" alias, which node's test runner cannot resolve, so its required flags are
// checked against the source: each field below must be declared required (a conditional field is only asked when visible).
const source = readFileSync(new URL("./schemas/startup.ts", import.meta.url), "utf8");
const declaration = (name: string) => source.split("\n").filter((l) => l.includes(`name: "${name}"`));

test("the startup wizard requires the fields the product team asked for", () => {
  for (const name of [
    "annualRevenue", "previousAnnualRevenue", "recurringRevenue", "customerCount", "previousCustomerCount", "activeUsers", "partnershipsCount", "monthlyBurn", "cashAvailable",
    "patentsGranted", "patentsPending", "regulatoryMilestone",
    "contactName", "contactEmail", "contactPhone", "contactLinkedin",
  ]) {
    const lines = declaration(name);
    assert.ok(lines.length > 0, `${name} is declared`);
    for (const l of lines) assert.match(l, /required: true/, `${name} must be required`);
  }
  assert.match(declaration("founders")[0], /minItems: 1/, "at least one team member");
});
