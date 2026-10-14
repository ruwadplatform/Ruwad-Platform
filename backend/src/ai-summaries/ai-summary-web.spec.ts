import { buildWebQuery, citedSources, selectWebSources, webForPrompt } from "./ai-summary-web";

const item = (title: string, url: string, snippet: string, position = 1) => ({ title, url, snippet, date: null, source: null, position });

describe("buildWebQuery", () => {
  it("uses the exact name plus where the organization is", () => {
    expect(buildWebQuery({ name: "Gees Health", headquarters: "Riyadh, Saudi Arabia" })).toBe('"Gees Health" Riyadh, Saudi Arabia healthcare');
  });
  it("returns null without a name", () => expect(buildWebQuery({ headquarters: "Riyadh" })).toBeNull());
});

describe("selectWebSources", () => {
  const items = [
    item("Gees Health launches kit", "https://www.news.example.com/a", "Gees Health unveils an at-home test."),
    item("Gees  HEALTH profile", "https://directory.example.org/gees", "Company page."),
    item("Something else", "https://x.example.com/y", "No relation here."),
    item("Gees Health again", "https://news.example.com/b", "Gees Health follow-up."),
    item("Gees Health third", "https://news.example.com/c", "Gees Health third piece."),
    item("Gees Health no snippet", "https://z.example.com", ""),
    item("Gees Health ftp", "ftp://z.example.com/q", "Gees Health."),
  ];
  const out = selectWebSources(items, "Gees Health");

  it("keeps only results that name the organization, with ids W1…", () => {
    expect(out.map((o) => o.id)).toEqual(["W1", "W2", "W3"]);
    expect(out.every((o) => /gees\s+health/i.test(`${o.title} ${o.text}`))).toBe(true);
  });
  it("allows at most two results per website and strips www", () => {
    expect(out.filter((o) => o.site === "news.example.com")).toHaveLength(2);
  });
  it("drops results without a snippet or a http(s) url", () => expect(out.some((o) => o.url.startsWith("ftp") || !o.text)).toBe(false));
  it("returns nothing for a name too short to match safely", () => expect(selectWebSources(items, "Ab")).toEqual([]));
  it("hides urls from the model prompt", () => expect(JSON.stringify(webForPrompt(out))).not.toContain("http"));
});

describe("citedSources", () => {
  const src = [{ id: "W1", title: "a", url: "u", site: "s", text: "t" }, { id: "W2", title: "b", url: "u", site: "s", text: "t" }];
  it("returns only the sources the text cites, once each, in order", () => {
    expect(citedSources("Text [W2]. More [W1] and again [W2].", src).map((s) => s.id)).toEqual(["W2", "W1"]);
    expect(citedSources("No citations.", src)).toEqual([]);
    expect(citedSources("Unknown [W9].", src)).toEqual([]);
  });
});
