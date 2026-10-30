import assert from "node:assert/strict";
import test from "node:test";
import {
  OTP_LENGTH, RESEND_SECONDS, applyInput, backspace, digitsToCode, emptyCode, formatCountdown, initialResendWait, isComplete, isVerificationRequired, messageFor, sanitizeDigits, secondsLeft,
} from "./verify-email-logic.ts";

test("six empty boxes, and a code is complete only with six digits", () => {
  assert.equal(OTP_LENGTH, 6);
  assert.deepEqual(emptyCode(), ["", "", "", "", "", ""]);
  assert.equal(isComplete(emptyCode()), false);
  assert.equal(isComplete(["1", "2", "3", "4", "5", ""]), false);
  assert.equal(isComplete(["1", "2", "3", "4", "5", "6"]), true);
  assert.equal(digitsToCode(["0", "0", "4", "2", "1", "7"]), "004217");
});

test("only digits survive: spaces, dashes, words and long text", () => {
  assert.equal(sanitizeDigits("123 456"), "123456");
  assert.equal(sanitizeDigits("123-456"), "123456");
  assert.equal(sanitizeDigits("Your code is 654321, thanks"), "654321");
  assert.equal(sanitizeDigits("12345678"), "123456");
  assert.equal(sanitizeDigits("abc"), "");
});

test("typing a digit fills the box and moves on; the last box stays put", () => {
  let r = applyInput(emptyCode(), 0, "4");
  assert.deepEqual(r, { digits: ["4", "", "", "", "", ""], focus: 1 });
  r = applyInput(r.digits, 1, "2");
  assert.deepEqual(r.digits, ["4", "2", "", "", "", ""]);
  assert.equal(applyInput(["1", "2", "3", "4", "5", ""], 5, "6").focus, 5);
});

test("typing over a filled box keeps the newest digit", () => {
  const r = applyInput(["4", "", "", "", "", ""], 0, "47"); // the box held 4 and "7" arrived
  assert.equal(r.digits[0], "7");
});

test("a full pasted code (or an autofill into one box) spreads over all six boxes, wherever it landed", () => {
  assert.deepEqual(applyInput(emptyCode(), 0, "123456"), { digits: ["1", "2", "3", "4", "5", "6"], focus: 5 });
  assert.deepEqual(applyInput(emptyCode(), 3, "123 456").digits, ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(applyInput(["9", "9", "9", "9", "9", "9"], 2, "004217").digits, ["0", "0", "4", "2", "1", "7"]);
});

test("a partial paste fills from the box it landed in, without running past the end", () => {
  assert.deepEqual(applyInput(emptyCode(), 0, "12").digits, ["1", "2", "", "", "", ""]);
  assert.deepEqual(applyInput(emptyCode(), 4, "789").digits, ["", "", "", "", "7", "8"]);
});

test("clearing a box and non-digit input never write a digit", () => {
  assert.deepEqual(applyInput(["1", "2", "", "", "", ""], 1, "").digits, ["1", "", "", "", "", ""]);
  assert.deepEqual(applyInput(["1", "", "", "", "", ""], 1, "x").digits, ["1", "", "", "", "", ""]);
});

test("backspace clears the box, or steps back and clears the previous one", () => {
  assert.deepEqual(backspace(["1", "2", "3", "", "", ""], 2), { digits: ["1", "2", "", "", "", ""], focus: 2 });
  assert.deepEqual(backspace(["1", "2", "", "", "", ""], 2), { digits: ["1", "", "", "", "", ""], focus: 1 });
  assert.deepEqual(backspace(["", "", "", "", "", ""], 0), { digits: ["", "", "", "", "", ""], focus: 0 });
});

test("the resend countdown", () => {
  assert.equal(secondsLeft(10_500, 10_000), 1);
  assert.equal(secondsLeft(10_000, 10_000), 0);
  assert.equal(secondsLeft(9_000, 10_000), 0);
  assert.equal(formatCountdown(45), "0:45");
  assert.equal(formatCountdown(60), "1:00");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(RESEND_SECONDS, 60);
  assert.equal(initialResendWait(null, 100_000), 60);
  assert.equal(initialResendWait(100_000 - 20_000, 100_000), 40);
  assert.equal(initialResendWait(100_000 - 90_000, 100_000), 0);
  assert.equal(initialResendWait(200_000, 100_000), 60); // a clock in the future is not trusted
});

test("sign-up answers are recognised strictly", () => {
  assert.equal(isVerificationRequired({ status: "verification_required", message: "x", resendAfterSeconds: 60 }), true);
  for (const v of [{ id: "u1", email: "a@b.c" }, null, undefined, "verification_required", { status: "ok" }, 1]) assert.equal(isVerificationRequired(v), false);
});

test("failures show plain, safe sentences (never a status code or a stack)", () => {
  assert.deepEqual(messageFor({ code: "INVALID_OTP", message: "ignored" }), { kind: "invalid", text: "That code isn't valid or has expired. Request a new one." });
  assert.equal(messageFor({ code: "RESEND_COOLDOWN", retryAfterSeconds: 33 }).retryAfter, 33);
  assert.equal(messageFor({ code: "RESEND_COOLDOWN" }).retryAfter, 60);
  assert.match(messageFor({ code: "RESEND_LIMIT" }).text, /ruwadplatform@gmail\.com/);
  assert.equal(messageFor({ status: 404 }).kind, "unavailable");
  assert.equal(messageFor({ status: 429 }).kind, "throttled");
  assert.equal(messageFor({ status: 0 }).kind, "network");
  assert.equal(messageFor(new TypeError("Failed to fetch")).kind, "network");
  assert.equal(messageFor({ status: 500, message: "stack trace at line 4" }).text, "Something went wrong. Please try again.");
  for (const v of [null, undefined, "x", 5]) assert.ok(messageFor(v).text.length > 0);
});
