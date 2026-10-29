# Daily.co media region: Frankfurt (`eu-central-1`) at domain level

Prepared 2026-10-29. **Nothing has been applied.** The only Daily calls made were read-only GETs. Applying the setting needs the owner's explicit authorisation (launch checklist, step 8).

**Scope of the owner's approval:** Frankfurt is approved as a **technical configuration choice** for where live media is processed. It is **not** approval of all international personal-data processing, and it does not establish Saudi PDPL compliance. Those are separate items (checklist step 9, and section 9 below).

## 1. The documented procedure (official documentation)

- **Read:** `GET https://api.daily.co/v1/` (bearer authentication). Returns `domain_name`, `domain_id` and `config`.
- **Set:** `POST https://api.daily.co/v1/`, JSON body `{"properties": {"geo": "eu-central-1"}}`, bearer authentication. (The reference defines `properties` as the only top-level key; its literal request example is not shown, so the nesting is read from the schema, and the tool verifies it by reading the result back.)
- **`geo`:** string, default null. Valid values: `af-south-1`, `ap-northeast-2`, `ap-southeast-1`, `ap-southeast-2`, `ap-south-1`, `eu-central-1` (Frankfurt), `eu-west-2`, `sa-east-1`, `us-east-1`, `us-west-2`.
- **Dashboard:** I could not find a documented dashboard menu path for this setting, so the API request above (through the guarded tool) is the procedure. Do not rely on a dashboard route that was not confirmed.
- Sources: [Set domain config](https://docs.daily.co/reference/rest-api/your-domain/set-domain-config), [Get domain config](https://docs.daily.co/reference/rest-api/your-domain/get-domain-config), [Create room (`geo`)](https://docs.daily.co/reference/rest-api/rooms/create-room).

## 2. Current domain configuration (read-only, 2026-10-29)

Domain `ruwadstudio`: `geo` **null**; `rtmp_geo` null; `transcription_geo` null; `enable_auto_recording` null; `intercom_auto_record` false; `enable_transcription` null; `enable_transcription_storage` false; `hipaa` false; `force_private_rooms` false; `max_webhook_count` 1; recording and transcription storage buckets null; **0 rooms, 0 webhooks.** The whole configuration (105 settings, nothing secret) was saved before any change as `docs/evidence/daily-domain-config-before-2026-10-29.json` and is the rollback reference.

## 3. How it affects rooms, and what could override it

- Daily describes the domain `geo` as the region where calls are hosted **by default**, and the room-level `geo` as the region where "Daily's call server (SFU) hosts a room"; the server is picked when the first participant joins. Without any `geo`, "the server is chosen by DNS for the first participant's location".
- Daily's domain documentation says room settings "override the domain settings for that room". **RUWAD rooms set no `geo`** (the room request contains name, privacy, `nbf`, `exp`, `max_participants`, `eject_at_room_exp`, chat, screenshare, prejoin and knocking; nothing about a region, recording or transcription), so every RUWAD room inherits the domain default. Only a room-level `geo` would override it, and none exists or is ever sent.
- **Not documented by Daily, so unverified:** whether the setting reaches rooms that already exist or sessions already running; whether a room read-back shows an inherited domain value; and exactly how domain and room `geo` rank (the page only states the general rule). Today there are **0 rooms**, and the tool refuses to change anything if rooms exist, which removes the first uncertainty for the launch.
- Daily's architecture guide also says participants normally connect to the nearest Daily server with traffic carried between servers; pinning keeps the room on one fixed server instead. The launch smoke test must therefore check the session's region in Daily's dashboard (section 6).

## 4. The configuration command (prepared, NOT run)

Uses the guarded tool `backend/scripts/ops/daily-domain-geo.js` (arguments: `show`, `set <region>`, `restore`). It reads the Daily key from `DAILY_API_KEY` or `~\secure\daily-api-key.txt` (created at checklist step 4), never prints it, and refuses before any network call without the exact confirmation phrase.

```powershell
cd "C:\Users\muzza\Desktop\Mohd Muzzammil\Mohd Muzzammil Projects\ruwad"
node backend/scripts/ops/daily-domain-geo.js show      # read only: current geo, recording/transcription defaults, rooms, the request it would send
$env:DAILY_GEO_CONFIRM = "SET-DAILY-GEO eu-central-1 ON ruwadstudio"
node backend/scripts/ops/daily-domain-geo.js set eu-central-1
Remove-Item Env:DAILY_GEO_CONFIRM
```

The tool refuses unless: the key belongs to the domain `ruwadstudio`; the region is one of the ten documented values; `geo` is currently null (it never overwrites another region); no recording or transcription default is enabled; **no rooms exist**. It then sends exactly `POST https://api.daily.co/v1/` with `{"properties":{"geo":"eu-central-1"}}`.

The same request by hand, for transparency (equivalent, without the safety checks):

```powershell
$k = (Get-Content "$HOME\secure\daily-api-key.txt" -Raw).Trim()
Invoke-RestMethod -Method Post -Uri "https://api.daily.co/v1/" -Headers @{ Authorization = "Bearer $k" } -ContentType "application/json" -Body '{"properties":{"geo":"eu-central-1"}}' | Out-Null
```

## 5. Read-back verification

`set` reads the **entire** domain configuration back and requires that `geo` is `eu-central-1` and that **no other setting changed**; it prints `other settings changed by this request: none` and `DONE`. Independent check at any time:

```powershell
node backend/scripts/ops/daily-domain-geo.js show     # geo must print "eu-central-1"; recording and transcription must still read DISABLED
(Invoke-RestMethod -Uri "https://api.daily.co/v1/" -Headers @{ Authorization = "Bearer $k" }).config.geo
```

## 6. Verifying the effect on a real call (smoke test, step 11)

Because room read-backs may not show an inherited value, check the first test meeting in Daily's dashboard (session or call details) and confirm the media region is Frankfurt; also read the room back (`GET https://api.daily.co/v1/rooms/<name>`) and note what it shows. If the dashboard shows another region, stop and use the rollback.

## 7. Rollback (restore the original configuration)

The original was `geo = null` and `geo` is the only setting this tool changes.

```powershell
$env:DAILY_GEO_CONFIRM = "RESTORE-DAILY-GEO ON ruwadstudio"
node backend/scripts/ops/daily-domain-geo.js restore
Remove-Item Env:DAILY_GEO_CONFIRM
```

It sends `{"properties":{"geo":null}}` and reads back. **Daily does not document how to unset a property, so null is unverified:** if Daily does not accept it, the tool says so (exit code 1) and the fallback is to clear the setting in the Daily dashboard's domain settings if it offers that, or to ask help@daily.co to clear it, using the saved original configuration as the reference. Because the setting only matters when a room is created, rolling back before any meeting has happened loses nothing. The real behaviour of `restore` can only be confirmed in production; plan a minute for it in the window.

## 8. Recording and transcription stay disabled

Verified read-only: domain-level `enable_auto_recording` null, `intercom_auto_record` false, `enable_transcription` null, `enable_transcription_storage` false, buckets null, `hipaa` false. RUWAD's room and token requests contain no recording or transcription property (verified in the code; 0 occurrences of "record", "transcri" or "geo"). Daily states recording is disabled by default for rooms created through the REST API. The tool re-checks these before `set` and refuses if a default is enabled; the set request changes nothing else (checked by the read-back).

## 9. No application code change is needed

Confirmed: RUWAD's video code sends no region and no recording property, so rooms inherit the domain default. **No change to the release candidate; the runtime code remains identical to `2998868`.** (A room-level `geo` in the code would be a later, optional hardening; it is not part of this release.)

## 10. Known limitations (what a media region does not cover)

Frankfurt governs only where the live audio and video call server runs. Per Daily's own documents it does **not** move:
- **Metadata and API data:** room names, times, and the tokens we create (which carry the person's RUWAD user id and display name) are handled by Daily's API in US-hosted infrastructure.
- **Logs and telemetry:** client IP addresses and the user id and display name we supply are kept in Daily's AWS logs (retention "no longer than necessary", no period published) and analytics sub-processors, all listed as US-hosted.
- **Account data:** Daily's DPA states its primary processing operations take place in the United States; every sub-processor it lists is US-hosted.
- **Webhook processing:** join/leave events originate in Daily's systems and are posted to RUWAD's backend in Sydney; they carry the room, session, user id, display name and times.
- Pinning media to Frankfurt means media from Saudi participants **leaves the Kingdom for Germany** (there is no Saudi or Gulf region); not pinning would send it to whichever region Daily chooses. Either way it is cross-border processing.
- Frankfurt is a technical choice. Whether the overall arrangement, including the US-hosted items above and the cross-border media, satisfies Saudi PDPL is a legal question for the responsible team and counsel; **do not treat regional routing as establishing compliance.**
