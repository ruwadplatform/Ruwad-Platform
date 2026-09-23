import { formatSarMillions } from "./report-stats.service";

describe("formatSarMillions (RUWĀD stores startup funding in SAR millions)", () => {
  it.each([
    [35.43, "SAR 35.4M"],
    [15, "SAR 15M"],
    [5, "SAR 5M"],
    [2.5, "SAR 2.5M"],
    [0.93, "SAR 0.93M"],
    [120, "SAR 120M"],
    [1500, "SAR 1.5B"],
    [0, "SAR 0"],
    [-3, "SAR 0"],
    [NaN, "SAR 0"],
  ])("%p -> %s", (input, expected) => expect(formatSarMillions(input)).toBe(expected));
});
