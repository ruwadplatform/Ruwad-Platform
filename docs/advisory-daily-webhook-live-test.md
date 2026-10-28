# Daily.co webhook: plan for one supervised live delivery test

**Status: executed once, on 2026-10-28, with the owner's approval (results in section 9).** The temporary webhook, room and tunnel were removed afterwards. Repeating it needs the owner's approval again.

## 1. What the test must prove
Everything about the webhook is tested locally with signed events built from Daily's published documentation. Four things can only be learned from a real delivery:
1. The real payload matches what the code reads (`room`, `session_id`, `user_id`, `joined_at` in unix seconds with a fraction, `duration` in seconds, envelope `version/type/id/payload/event_ts`).
2. Daily's real signature verifies against the raw body with our secret.
3. How Daily stamps `X-Webhook-Timestamp`, in particular on a retried delivery (the documentation names no window; our default is 5 minutes and is configurable with `DAILY_WEBHOOK_TOLERANCE_SECONDS`).
4. That Daily's creation-time test message (a signed `{"test":"test"}`) gets HTTP 200 within its 8 second limit.

## 2. The public URL that is needed
Daily must reach `POST https://<public-host>/api/advisory/webhooks/daily` over HTTPS. The localhost backend is not reachable, so a **temporary tunnel** is used.

| Option | Verdict |
|---|---|
| **Cloudflare Quick Tunnel** (`cloudflared tunnel --url http://127.0.0.1:4100`) | **Recommended.** No account, HTTPS, a random `*.trycloudflare.com` address that disappears when the process stops. |
| ngrok (free) | Fine alternative (`*.ngrok-free.app`), needs an account and a token. |
| An isolated staging backend | Not recommended for this test: it needs a deploy and its own database. Worth doing only when a real pre-production environment exists. |
| The production backend | **No.** It would need `DAILY_WEBHOOK_SECRET`, the Daily provider and the key set on Lightsail: a production change. Not part of this test. |

**The tunnel never points at the backend directly.** It points at a tiny local relay (`npm run daily:webhook -- relay`, port 4100) that forwards **only** `POST /api/advisory/webhooks/daily` to the local backend, byte for byte. Everything else is a 404, so the rest of the local API is never exposed. The relay passes only `content-type`, `x-webhook-timestamp`, `x-webhook-signature` and `x-forwarded-for`, never logs a header or a body, refuses bodies over 64 KB, and switches itself off after 30 minutes.

## 3. How the webhook would be registered
`POST https://api.daily.co/v1/webhooks` with `{ url, eventTypes: ["participant.joined","participant.left"], hmac, retryType: "exponential" }`, done by `npm run daily:webhook -- register <url>`:
- subscribes to **participant events only**, never recordings (recording stays off everywhere);
- `hmac` is a base64 secret generated for this test and held only in the shell variable `LOCAL_DAILY_WEBHOOK_SECRET`; the local backend is started with the **same** value, so it verifies what Daily signs;
- `exponential` retries (about 1, 5, 25, 125 and 625 seconds) so one hiccup cannot switch the webhook off (the default `circuit-breaker` marks it `FAILED` after 3 failures);
- the helper refuses unless `CONFIRM_DAILY_WEBHOOK=register` is set, the URL is https on a tunnel host (or the one host in `LOCAL_WEBHOOK_PUBLIC_HOST`) ending in the webhook path, it is not a production host, and **no webhook already exists** on the account.

As of 2026-10-28 the Daily account has **0 webhooks and 0 rooms** (read-only check).

## 4. How signatures are verified
Daily sends `X-Webhook-Timestamp` and `X-Webhook-Signature`. RUWĀD computes `HMAC-SHA256( base64-decoded secret, "<timestamp>.<raw request body>" )`, base64-encodes it and compares it in constant time. It uses the exact bytes received (`rawBody`), never a re-serialised JSON. A request is refused (401) when a header is missing, the timestamp is outside the window, or the signature differs; the log records only the reason (and, for a stale timestamp, the clock difference), never a value. Replays are also harmless: each event is recorded once by its id and by its type plus `session_id`, in the same transaction as the attendance it creates.

## 5. Running it (all on this computer, about 30 minutes)
Prerequisites: local Postgres (`npm run db:local`), a built backend (`npm run build`), `cloudflared` installed, a local advisor, a founder and one confirmed consultation (create them through the app or a local fixture; none exist in the local database now).
1. In the shell: `LOCAL_DAILY_WEBHOOK_SECRET=<base64, 32+ bytes>` (for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) and `LOCAL_DAILY_DOMAIN=<your Daily subdomain>`.
2. Start the backend with real Daily, explicitly: `npm run start:local -- --real-daily`. (Only the Daily key is read from `backend/.env`; email stays mock.)
3. Start the relay: `npm run daily:webhook -- relay`. Start the tunnel: `cloudflared tunnel --url http://127.0.0.1:4100`. Note the printed `https://….trycloudflare.com`.
4. Check the route is reachable and protected: `POST` an unsigned body to `https://<host>/api/advisory/webhooks/daily` (expect **401**), `GET` it (expect **404**).
5. Register: `CONFIRM_DAILY_WEBHOOK=register npm run daily:webhook -- register https://<host>/api/advisory/webhooks/daily`. Daily sends its signed test message first; success proves items 2 and 4 of section 1. Check `npm run daily:webhook -- list` shows `ACTIVE`.
6. **One real event:** open the meeting window for ONE local consultation (35 minutes), join once as the founder (this creates the single real Daily room), stay about a minute, leave. Expect, in the backend log, `Daily webhook participant.joined: processed (founder joined ADV-…)` and the same for `participant.left`, and in the relay log `POST webhook -> 200`.
7. Compare: the attendance row (`source = WEBHOOK`) against Daily's own meeting record (read-only `GET /meetings`), and note the exact payload field names, the timestamp skew and whether `event_ts` is in seconds.
8. Record the findings (anything that differs from the code's assumptions is fixed locally and re-tested).

## 6. Removing everything afterwards
1. `CONFIRM_DAILY_WEBHOOK=delete npm run daily:webhook -- delete <uuid>` (only works on a tunnel-hosted webhook, so it can never remove a production one), then `npm run daily:webhook -- list` must show **0**.
2. Stop the tunnel, the relay and the backend (the relay also stops itself).
3. The one test room expires and ejects everyone at its end time; it can also be deleted with `DELETE /rooms/<name>`.
4. Discard the shell variable; the secret was never written to a file.
If any step fails, steps 1 and 2 are the whole rollback: nothing else persists.

## 7. Risks and how they are covered
| Risk | Cover |
|---|---|
| The tunnel exposes the local machine | It exposes one route only (the relay), for minutes, with a local database and mock email behind it. |
| Daily retries carry the original timestamp and arrive after the window | The refusal log says so (`stale-timestamp`, with the skew); widen `DAILY_WEBHOOK_TOLERANCE_SECONDS` if that is what the test shows. |
| A webhook left registered | `list` before and after; the helper registers only when none exist and the relay switches itself off. |
| The Daily account is later shared with production | A temporary webhook on a shared Daily domain would also receive production events if left behind: delete it first, and prefer a separate Daily domain for testing. |
| A secret in a log | Logs carry reasons and counts only; a test asserts that no secret, signature, timestamp header, token or room name is logged. |

## 8. Later, for production (a separate approval)
Set `ADVISORY_VIDEO_PROVIDER=daily`, `DAILY_API_KEY`, `DAILY_DOMAIN` and `DAILY_WEBHOOK_SECRET` on the backend host, apply the opt-in Advisory migrations in one window, and register the backend's public HTTPS URL with the same `hmac`. Not part of this test.

## 9. Results of the live test (2026-10-28)
One temporary webhook, one disposable consultation, one real Daily room, two test participants (real `daily-js`, devices off), a temporary Cloudflare Quick Tunnel to the single-route relay. Everything else was local: scratch copy of the local database on 127.0.0.1:55432, mock email, no production system involved. The webhook, the room and the tunnel were deleted afterwards and the Daily account was verified to have 0 webhooks and 0 rooms.

**Confirmed**
- The creation-time message (signed `{"test":"test"}`) was accepted with HTTP 200 well inside Daily's 8 seconds.
- Every real delivery's signature verified, checked by the backend and independently by a second HMAC implementation.
- Real events were matched to the right consultation (by room) and the right person (by the token's `user_id`).
- Retry: after one injected failure Daily re-sent the **same event id about 3.6 seconds later with a fresh timestamp**, and it was processed. The 5 minute default window is therefore fine for retries.
- Replay protection with real signatures: a redelivery inside the window is answered `duplicate` (HTTP 200); the same signed delivery 309 seconds old is refused as `stale-timestamp`.
- Accuracy on clean sessions: RUWĀD 34.74 s / 45.46 s against Daily's own record 34 s / 45 s and the participants' own clocks 34.61 s / 45.38 s.
- No secret, signature or token in any log or capture; the room is private with no recording property.

**What the documentation does not say**
- `X-Webhook-Timestamp` is in **milliseconds** (13 digits). The code already accepted both.
- `event_ts` and `joined_at` are unix seconds with a fraction; `user_name` arrives URL-encoded; a leave carries `joined_at` that can differ from the join's by a few milliseconds.
- **One session_id can send several `participant.left` events.** When a connection drops and recovers Daily keeps the session: left (122 s), joined again, left (137.75 s). Deduplicating on type plus `session_id` (as Daily's documentation advises) discarded the later, longer leave and under-counted a 137 s stay as 122 s. Fixed: the duplicate key also carries the event's own time (the leave's duration, the join's joined_at), so an identical redelivery is still a duplicate and a genuinely new event is not. A regression test uses the captured numbers.
- A backgrounded browser tab freezes its connection and makes Daily record a leave and a rejoin about every minute. This was a property of the test harness (two tabs), not of the product, and was avoided in the second round (both participants in one foreground tab).

**Known limitation:** within one session, a disconnected gap (a few seconds per reconnect) is counted as present, because attendance is stored as one span per session. In the extreme flapping case above this overstated a 431 s stay (Daily's figure) as 467 s. It cannot change an outcome at the 5 minute threshold in a realistic case; storing each connected stretch separately would remove it if ever needed.
