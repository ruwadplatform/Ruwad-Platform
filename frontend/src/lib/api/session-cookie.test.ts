import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardableSessionCookie } from "./session-cookie.ts";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";

test("a session token is forwarded as the one RUWĀD cookie", () => {
  assert.equal(forwardableSessionCookie(JWT), `ruwad_token=${JWT}`);
});

test("nothing is forwarded without a well-formed token, so the visitor is treated as signed out", () => {
  for (const bad of [undefined, null, "", "not-a-token", "a.b", "a.b.c.d", `${JWT}; other=1`, `${JWT}\r\nX-Evil: 1`, `${JWT} `, "a b.c.d"]) assert.equal(forwardableSessionCookie(bad), undefined, String(bad));
});
