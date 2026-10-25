import { cleanText } from "./advisory-text";

describe("cleanText", () => {
  it("keeps ordinary text, tabs and line breaks, and trims the ends", () => {
    expect(cleanText("  Hello,\tworld\nsecond line \r\n")).toBe("Hello,\tworld\nsecond line");
  });
  it("drops control characters", () => {
    expect(cleanText("a\u0000b\u0007c\u001Fd")).toBe("abcd");
  });
  it("keeps Arabic and other non-ASCII text intact", () => {
    expect(cleanText("استشارة مع الدكتور عمر")).toBe("استشارة مع الدكتور عمر");
  });
  it("treats null and undefined as empty", () => {
    expect(cleanText(undefined)).toBe("");
    expect(cleanText(null)).toBe("");
  });
});
