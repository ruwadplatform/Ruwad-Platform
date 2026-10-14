import { parseSummary, validateSummary } from "./ai-summary-generator";

const overview = "Gees Health is a Riyadh-based diagnostics company founded in 2026 that develops at-home saliva hormone testing for women. Its approach pairs a collection kit with an app that analyses results and tracks patterns over time. The company is at the Pre-Seed stage, employs 3 people and sells through a kit-plus-subscription model, with a stated focus on continuous insight into cycle and stress.";
const data = JSON.stringify({ name: "Gees Health", foundedYear: 2026, employees: 3, developmentStage: "Pre-Seed", regulatoryAndIpStatus: { fda: "Breakthrough Device Designation" } });
const good = { overview, highlights: ["Founded in 2026 in Riyadh.", "Pre-Seed stage with 3 employees."] };

describe("parseSummary", () => {
  it("parses a plain JSON object and one wrapped in a code fence or prose", () => {
    expect(parseSummary(JSON.stringify(good))).toEqual(good);
    expect(parseSummary("```json\n" + JSON.stringify(good) + "\n```")).toEqual(good);
    expect(parseSummary("Here you go: " + JSON.stringify(good))).toEqual(good);
  });
  it("rejects anything that is not the required shape", () => {
    for (const bad of ["", "no json here", "{\"overview\": 5, \"highlights\": []}", "{\"overview\": \"x\", \"highlights\": [1, 2]}", "{broken"]) expect(parseSummary(bad)).toBeNull();
  });
});

describe("validateSummary", () => {
  it("accepts a well-formed summary whose numbers all come from the data", () => expect(validateSummary(good, data)).toBeNull());

  it("rejects an invented number (funding, headcount, year)", () => {
    expect(validateSummary({ ...good, overview: overview.replace("employs 3", "employs 40") }, data)).toMatch(/number 40/);
    expect(validateSummary({ ...good, highlights: ["Raised 5 million.", "Pre-Seed stage."] }, data)).toMatch(/number 5/);
  });

  it("rejects an approval claim the data does not make, including from a Breakthrough designation", () => {
    expect(validateSummary({ ...good, highlights: ["Its device is FDA approved.", "Founded in 2026."] }, data)).toMatch(/approval/);
    expect(validateSummary({ ...good, overview: overview + " It holds regulatory clearance." }, data)).toMatch(/approval|word|words/);
  });

  it("allows approval wording when the data itself states it", () => {
    const withApproval = JSON.stringify({ name: "X", foundedYear: 2026, employees: 3, sfda: "Approved" });
    expect(validateSummary({ ...good, highlights: ["SFDA status: approved.", "Founded in 2026."] }, withApproval)).toBeNull();
  });

  it("rejects promotional wording not present in the data, and placeholder text", () => {
    expect(validateSummary({ ...good, highlights: ["A revolutionary platform.", "Founded in 2026."] }, data)).toMatch(/promotional/);
    expect(validateSummary({ ...good, highlights: ["Funding: undefined.", "Founded in 2026."] }, data)).toMatch(/placeholder/);
  });

  it("accepts citations of web results that were supplied, ignoring the marker in word and number checks", () => {
    const cited = { overview: overview + " [W1]", highlights: ["Founded in 2026 [W2].", "Pre-Seed stage."] };
    expect(validateSummary(cited, data, ["W1", "W2"])).toBeNull();
  });

  it("rejects a citation that does not exist", () => {
    expect(validateSummary({ ...good, highlights: ["Founded in 2026 [W3].", "Pre-Seed stage."] }, data, ["W1"])).toMatch(/citation \[W3\]/);
    expect(validateSummary({ ...good, overview: overview + " [W1]" }, data)).toMatch(/citation/);
  });

  it("still rejects an invented number even when a citation is present", () => {
    expect(validateSummary({ ...good, highlights: ["Raised 12 million [W1].", "Pre-Seed stage."] }, data, ["W1"])).toMatch(/number 12/);
  });

  it("enforces length and highlight count", () => {
    expect(validateSummary({ ...good, overview: "Too short." }, data)).toMatch(/words/);
    expect(validateSummary({ ...good, highlights: ["Only one highlight here."] }, data)).toMatch(/2 or 3/);
    expect(validateSummary({ ...good, highlights: ["One two.", "Three four.", "Five six.", "Seven eight."] }, data)).toMatch(/2 or 3/);
  });
});
