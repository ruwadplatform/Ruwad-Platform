import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdvisoryBookingsEnabledGuard, BOOKINGS_DISABLED_CODE, BOOKINGS_DISABLED_MESSAGE, BookingsDisabledException, bookingsEnabled } from "./advisory-bookings-gate";

const env = (vars: Record<string, string | undefined>) => (k: string) => vars[k];
const guardWith = (vars: Record<string, string | undefined>) => new AdvisoryBookingsEnabledGuard({ get: (k: string) => vars[k] } as unknown as ConfigService);

describe("the booking switch", () => {
  it("is off by default and off for anything that is not exactly \"true\"", () => {
    expect(bookingsEnabled(env({}))).toBe(false);
    expect(bookingsEnabled(env({ ADVISORY_ENABLED: "true" }))).toBe(false);
    for (const v of ["", "false", "FALSE", "0", "1", "yes", "on", "truee", "True"]) expect(bookingsEnabled(env({ ADVISORY_ENABLED: "true", ADVISORY_BOOKINGS_ENABLED: v }))).toBe(false);
  });

  it("is on only when Advisory is on and the booking variable is exactly \"true\" (surrounding spaces are ignored)", () => {
    expect(bookingsEnabled(env({ ADVISORY_ENABLED: "true", ADVISORY_BOOKINGS_ENABLED: "true" }))).toBe(true);
    expect(bookingsEnabled(env({ ADVISORY_ENABLED: "true", ADVISORY_BOOKINGS_ENABLED: " true " }))).toBe(true);
  });

  it("never turns bookings on by itself while Advisory is off", () => {
    expect(bookingsEnabled(env({ ADVISORY_BOOKINGS_ENABLED: "true" }))).toBe(false);
    expect(bookingsEnabled(env({ ADVISORY_ENABLED: "false", ADVISORY_BOOKINGS_ENABLED: "true" }))).toBe(false);
  });
});

describe("the booking guard and its error", () => {
  it("refuses with a 403 whose body is exactly { statusCode, error, code, message }", () => {
    let caught: unknown;
    try { guardWith({ ADVISORY_ENABLED: "true" }).canActivate(); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BookingsDisabledException);
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getStatus()).toBe(403);
    expect((caught as ForbiddenException).getResponse()).toEqual({ statusCode: 403, error: "Forbidden", code: BOOKINGS_DISABLED_CODE, message: BOOKINGS_DISABLED_MESSAGE });
  });

  it("carries the agreed words and code", () => {
    expect(BOOKINGS_DISABLED_CODE).toBe("BOOKINGS_DISABLED");
    expect(BOOKINGS_DISABLED_MESSAGE).toBe("Online consultation booking is currently unavailable. Please contact the RUWĀD team to arrange your consultation.");
  });

  it("lets a request through only when bookings are on", () => {
    expect(guardWith({ ADVISORY_ENABLED: "true", ADVISORY_BOOKINGS_ENABLED: "true" }).canActivate()).toBe(true);
    expect(() => guardWith({ ADVISORY_ENABLED: "true", ADVISORY_BOOKINGS_ENABLED: "false" }).canActivate()).toThrow(BookingsDisabledException);
  });
});
