import { LINKEDIN_PATTERN, normalizeLinkedInUrl } from "./linkedin.util";

describe("normalizeLinkedInUrl", () => {
  it("accepts a pasted profile in any common form and returns a clean https link", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/khalid-alshaigi/")).toBe("https://www.linkedin.com/in/khalid-alshaigi/");
    expect(normalizeLinkedInUrl("linkedin.com/in/sara")).toBe("https://linkedin.com/in/sara");
    expect(normalizeLinkedInUrl("  http://sa.linkedin.com/in/omar  ")).toBe("https://sa.linkedin.com/in/omar");
  });

  it("blank means not provided", () => {
    expect(normalizeLinkedInUrl("")).toBeUndefined();
    expect(normalizeLinkedInUrl("   ")).toBeUndefined();
    expect(normalizeLinkedInUrl(undefined)).toBeUndefined();
    expect(normalizeLinkedInUrl(null)).toBeUndefined();
  });

  it("rejects anything that is not a linkedin.com profile address", () => {
    expect(normalizeLinkedInUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeLinkedInUrl("https://evil.com/linkedin.com/in/x")).toBeUndefined();
    expect(normalizeLinkedInUrl("https://linkedin.com.evil.com/in/x")).toBeUndefined();
    expect(normalizeLinkedInUrl("https://notlinkedin.com/in/x")).toBeUndefined();
    expect(normalizeLinkedInUrl("https://www.linkedin.com")).toBeUndefined(); // the home page is not a profile
  });

  it("the validator pattern agrees: empty and profile links pass, other addresses fail", () => {
    expect(LINKEDIN_PATTERN.test("")).toBe(true);
    expect(LINKEDIN_PATTERN.test("https://www.linkedin.com/in/x")).toBe(true);
    expect(LINKEDIN_PATTERN.test("linkedin.com/in/x")).toBe(true);
    expect(LINKEDIN_PATTERN.test("https://example.com/in/x")).toBe(false);
    expect(LINKEDIN_PATTERN.test("javascript:alert(1)")).toBe(false);
  });
});
