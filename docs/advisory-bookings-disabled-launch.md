# Advisory Services: public launch with online booking switched off

Status: implemented and tested LOCALLY ONLY. Nothing is committed, pushed, deployed or changed in production, Vercel or Lightsail.

## What the launch does

Advisory Services is visible to everyone, advisors and professors can register, apply and upload their CV, administrators review and approve, and approved advisors appear publicly with their services and open times. **Nobody can create or confirm a consultation booking.** Pressing Confirm on the review screen shows the agreed message and a Contact RUWĀD button; the server refuses every booking route.

The Daily.co cross-border/PDPL review stays **DEFERRED and NOT APPROVED**. With bookings off no video room can be created and no live consultation can start. Frankfurt routing is media routing only, not compliance clearance.

## The switch

`ADVISORY_BOOKINGS_ENABLED` (backend environment, read at start-up). Bookings are on only when Advisory is on **and** the value is exactly `true`. Absent, empty, `false`, `1`, `yes`, `True`, anything else: off. **Production needs no environment change at launch**, because the variable is simply not there.

Turning bookings on later is that one variable plus a restart (a new Lightsail deployment). No code change, no migration, no frontend rebuild: the screens ask `GET /api/advisory/status` (`{ "bookingsEnabled": false }`, public, never cached) and fail closed if it cannot be reached.

| Route | While off |
| --- | --- |
| `POST /advisory/bookings` | 403 `BOOKINGS_DISABLED`, nothing created |
| `POST /advisory/bookings/:id/reschedule` | 403, no proposal row, no held slot |
| `POST /advisory/bookings/:id/reschedule/accept` | 403, no replacement booking |
| `POST /advisory/advisor/bookings/:id/approve` | 403, a waiting request stays PENDING |
| `POST /advisory/bookings/:id/meeting/join` | 403, the only code that opens a video room is never reached |

The body is exactly `{ "statusCode": 403, "error": "Forbidden", "code": "BOOKINGS_DISABLED", "message": "Online consultation booking is currently unavailable. Please contact the RUWĀD team to arrange your consultation." }`. A signed-out caller still gets 401 first. The same rule is checked a second time inside the services (`create`, `approve`, `proposeReschedule`, `acceptReschedule`, meeting `join`), so no other caller can get around the routes. Cancel, reject, decline, withdraw and complete stay available: they only close existing bookings.

Still working while off: directory, profiles, services and open times (read-only, nothing is held), registration and CV upload, administrator review, the advisor dashboard (profile, services, availability), My Consultations, the admin console.

## Screens

- Booking panel and review modal stay. Their note no longer promises "your request goes to the advisor... Nothing is charged": it says online booking is not open yet and offers Contact RUWĀD.
- Confirm checks the server's current answer first. Closed: the exact message plus Contact RUWĀD, no booking call, and a signed-out visitor is not asked to sign in. Should the server refuse anyway, the same message is shown.
- Advisor cards say "View profile" instead of "View & Book"; the "How it works" explainer carries the same note.
- Contact RUWĀD is a `mailto:` link with the subject and body filled in from the advisor, the consultation and the chosen date and time (when there is one). The address is the single constant `CONTACT_EMAIL` in `frontend/src/features/advisory/booking-availability.ts`, confirmed by the owner as `ruwadplatform@gmail.com`.

## Rollout order (each step needs its own authorisation)

1. Push the code to `master` (GitHub Actions replaces the Lightsail container). No migration, no environment change. The running production backend still accepts booking requests until this lands, which is harmless only while no advisor is approved.
2. Verify: `GET /api/advisory/status` says false and `POST /api/advisory/bookings` with a signed-in user returns 403 `BOOKINGS_DISABLED`.
3. Only then add `NEXT_PUBLIC_ADVISORY_ENABLED=true` in Vercel (Production) and redeploy with the build cache off.
4. Approve advisors afterwards, never before step 2.

`lightsail-env-audit.js` (read-only) now flags `ADVISORY_BOOKINGS_ENABLED=true` on the running service as a forbidden value until bookings are approved. (`lightsail-advisory-env.js` does not use that rule list, so it neither adds nor removes the variable.)

## To open bookings later

Set `ADVISORY_BOOKINGS_ENABLED=true` on the Lightsail service (a new deployment keeps everything else), verify `GET /api/advisory/status` says true, then make a first booking. Payment, fees and the Daily.co cross-border/PDPL decision are separate decisions and are not part of this switch.

## Local use

`npm run start:local` (backend) runs with bookings OFF, like production. `npm run start:local -- --bookings` switches them on locally. The integration suite runs its main application with bookings ON and has a dedicated suite for the OFF default.
