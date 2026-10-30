import { randomBytes } from "crypto";
import {
  CODE_RETENTION_MS, MAX_PER_IP_PER_DAY, MAX_ROWS_PER_DAY, MAX_SENT_PER_DAY, OTP_LENGTH, OTP_TTL_MS, PENDING_TTL_MS, RESEND_COOLDOWN_MS,
  decideSend, generateCode, hashCode, hashIp, hashesEqual, maskEmail, normalizeCodeInput, readPending, signPending,
} from "./otp-logic";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const USER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const NOW = new Date("2026-11-01T12:00:00Z");

describe("code generation", () => {
  it("is always exactly six digits, zero-padded", () => {
    for (let i = 0; i < 5000; i++) expect(generateCode()).toMatch(/^\d{6}$/);
    expect(OTP_LENGTH).toBe(6);
  });

  it("covers the whole range with no obvious bias (leading zeros occur, every first digit occurs)", () => {
    const firstDigits = new Set<string>();
    let leadingZero = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const c = generateCode(); firstDigits.add(c[0]!); if (c.startsWith("0")) leadingZero++; }
    expect(firstDigits.size).toBe(10);
    expect(leadingZero / n).toBeGreaterThan(0.07); // expected 0.1
    expect(leadingZero / n).toBeLessThan(0.13);
  });

  it("does not repeat in a short run (a fixed or counting generator would)", () => {
    const seen = new Set(Array.from({ length: 200 }, generateCode));
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe("what a person typed", () => {
  it("accepts six digits with or without spaces and dashes", () => {
    expect(normalizeCodeInput("123456")).toBe("123456");
    expect(normalizeCodeInput(" 123 456 ")).toBe("123456");
    expect(normalizeCodeInput("123-456")).toBe("123456");
    expect(normalizeCodeInput("004217")).toBe("004217");
  });

  it("rejects everything else without looking at it further", () => {
    for (const v of ["12345", "1234567", "12345a", "", "abcdef", "12 34", null, undefined, 123456, {}, [], "1".repeat(40), "123456\n123456"]) expect(normalizeCodeInput(v)).toBeNull();
  });
});

describe("stored hash", () => {
  it("is a 64-character keyed digest, never the code", () => {
    const h = hashCode(KEY, USER, "row-1", "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
  });

  it("changes with the key, the account, the row and the code (a leaked hash cannot be moved or replayed)", () => {
    const base = hashCode(KEY, USER, "row-1", "123456");
    expect(hashCode(OTHER_KEY, USER, "row-1", "123456")).not.toBe(base);
    expect(hashCode(KEY, "7c9e6679-7425-40de-944b-e07fc1f90ae8", "row-1", "123456")).not.toBe(base);
    expect(hashCode(KEY, USER, "row-2", "123456")).not.toBe(base);
    expect(hashCode(KEY, USER, "row-1", "123457")).not.toBe(base);
    expect(hashCode(KEY, USER, "row-1", "123456")).toBe(base);
  });

  it("cannot be reversed by trying every code without the key", () => {
    const h = hashCode(KEY, USER, "row-1", "424242");
    let found = 0;
    for (let i = 0; i < 1000; i++) if (hashCode(OTHER_KEY, USER, "row-1", String(i).padStart(6, "0")) === h) found++;
    expect(found).toBe(0);
  });

  it("compares in a way that accepts only identical digests", () => {
    const h = hashCode(KEY, USER, "row-1", "123456");
    expect(hashesEqual(h, h)).toBe(true);
    expect(hashesEqual(h, hashCode(KEY, USER, "row-1", "654321"))).toBe(false);
    expect(hashesEqual(h, h.slice(0, 63))).toBe(false);
    expect(hashesEqual(h, "z".repeat(64))).toBe(false);
    expect(hashesEqual("", "")).toBe(false);
  });
});

describe("address helpers", () => {
  it("masks the local part and keeps the domain", () => {
    expect(maskEmail("muzzammil@example.com")).toBe("m***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });

  it("hashes an IP under the key and returns null when there is none", () => {
    expect(hashIp(KEY, "203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp(KEY, "203.0.113.7")).toBe(hashIp(KEY, "203.0.113.7"));
    expect(hashIp(KEY, "203.0.113.7")).not.toBe(hashIp(OTHER_KEY, "203.0.113.7"));
    expect(hashIp(KEY, "203.0.113.7")).not.toContain("203");
    expect(hashIp(KEY, "")).toBeNull();
    expect(hashIp(KEY, undefined)).toBeNull();
  });
});

describe("when another code may be sent", () => {
  const idle = { lastSentAt: null, sentLast24h: 0, rowsLast24h: 0, ipRowsLast24h: 0 };
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  it("allows the first code", () => expect(decideSend(idle, NOW)).toEqual({ ok: true }));

  it("holds a new code back for 60 seconds after the last one, and says how long", () => {
    expect(decideSend({ ...idle, lastSentAt: ago(10_000), sentLast24h: 1, rowsLast24h: 1 }, NOW)).toEqual({ ok: false, reason: "COOLDOWN", retryAfterSeconds: 50 });
    expect(decideSend({ ...idle, lastSentAt: ago(RESEND_COOLDOWN_MS - 1), sentLast24h: 1, rowsLast24h: 1 }, NOW)).toMatchObject({ ok: false, reason: "COOLDOWN", retryAfterSeconds: 1 });
    expect(decideSend({ ...idle, lastSentAt: ago(RESEND_COOLDOWN_MS), sentLast24h: 1, rowsLast24h: 1 }, NOW)).toEqual({ ok: true });
  });

  it("stops at ten delivered codes a day", () => {
    expect(decideSend({ ...idle, lastSentAt: ago(3_600_000), sentLast24h: MAX_SENT_PER_DAY - 1, rowsLast24h: 9 }, NOW)).toEqual({ ok: true });
    expect(decideSend({ ...idle, lastSentAt: ago(3_600_000), sentLast24h: MAX_SENT_PER_DAY, rowsLast24h: 10 }, NOW)).toEqual({ ok: false, reason: "DAILY" });
  });

  it("bounds every row, delivered or not, and every address", () => {
    expect(decideSend({ ...idle, rowsLast24h: MAX_ROWS_PER_DAY }, NOW)).toEqual({ ok: false, reason: "ROWS" });
    expect(decideSend({ ...idle, ipRowsLast24h: MAX_PER_IP_PER_DAY }, NOW)).toEqual({ ok: false, reason: "IP" });
  });

  it("a code that failed to send does not start the cooldown or use up the daily allowance (it is simply not counted as sent)", () => {
    expect(decideSend({ lastSentAt: null, sentLast24h: 0, rowsLast24h: 4, ipRowsLast24h: 4 }, NOW)).toEqual({ ok: true });
  });
});

describe("pending-verification ticket", () => {
  const ticket = { u: USER, m: "m***@example.com", e: NOW.getTime() + PENDING_TTL_MS };

  it("round-trips while it is fresh", () => {
    expect(readPending(KEY, signPending(KEY, ticket), NOW)).toEqual(ticket);
  });

  it("is refused when expired, tampered with, signed by another key, or malformed", () => {
    const token = signPending(KEY, ticket);
    expect(readPending(KEY, token, new Date(ticket.e))).toBeNull();
    expect(readPending(OTHER_KEY, token, NOW)).toBeNull();
    const [body, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...ticket, u: "7c9e6679-7425-40de-944b-e07fc1f90ae8" })).toString("base64url");
    expect(readPending(KEY, `${forged}.${sig}`, NOW)).toBeNull();
    expect(readPending(KEY, `${body}.${sig.slice(0, -2)}AA`, NOW)).toBeNull();
    for (const bad of [undefined, "", "x", "a.b", `${body}`, "x".repeat(2000)]) expect(readPending(KEY, bad, NOW)).toBeNull();
  });

  it("rejects a ticket whose subject is not a UUID even if correctly signed", () => {
    expect(readPending(KEY, signPending(KEY, { ...ticket, u: "admin" }), NOW)).toBeNull();
  });

  it("carries no role, permission or login: only an account id, a masked address and an expiry", () => {
    const body = JSON.parse(Buffer.from(signPending(KEY, ticket).split(".")[0]!, "base64url").toString("utf8"));
    expect(Object.keys(body).sort()).toEqual(["e", "m", "u"]);
  });
});

describe("the agreed numbers", () => {
  it("are ten minutes, 60 seconds, ten a day, thirty rows, thirty per address, thirty-minute ticket, seven-day retention", () => {
    expect(OTP_TTL_MS).toBe(600_000);
    expect(RESEND_COOLDOWN_MS).toBe(60_000);
    expect(MAX_SENT_PER_DAY).toBe(10);
    expect(MAX_ROWS_PER_DAY).toBe(30);
    expect(MAX_PER_IP_PER_DAY).toBe(30);
    expect(PENDING_TTL_MS).toBe(1_800_000);
    expect(CODE_RETENTION_MS).toBe(604_800_000);
  });
});
