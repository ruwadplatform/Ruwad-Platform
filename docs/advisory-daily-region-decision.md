# Daily.co regional routing: investigation and recommendation

Prepared 2026-10-29. **Research and documentation only: no code, production setting, Daily setting or secret was changed or created.** The only Daily calls were read-only GETs. This is technical analysis, not legal advice.

## 0. Correction

Earlier in this release preparation I recorded the Daily.co data-residency item as an unconditional approval. The owner's decision is **REGION**: regional routing and data handling must be investigated before production activation. That item is therefore **open**, and it is now a hard gate in the launch checklist (section 8).

## 1. What Daily supports (official documentation)

- **`geo` pins where a room's call server (SFU) runs.** "Without it, the server is chosen by DNS for the first participant's location"; setting it keeps the call on a fixed server whatever country people join from. It exists as a **room property** and as a **domain default** (`POST https://api.daily.co/v1/` with body `{"properties": {...}}`, as documented). Room-level settings override the domain.
- **Selectable regions (10):** `af-south-1` Cape Town, `ap-northeast-2` Seoul, `ap-southeast-1` Singapore, `ap-southeast-2` Sydney, `ap-south-1` Mumbai, `eu-central-1` Frankfurt, `eu-west-2` London, `sa-east-1` São Paulo, `us-east-1` N. Virginia, `us-west-2` Oregon. **There is no region in Saudi Arabia or the Gulf.** Canada (Montreal) and "enterprise regions beyond this list" are not self-serve: they are enabled by contacting Daily.
- **Other geo settings exist only for features we do not use:** `rtmp_geo` (streaming), `dialout_geo` / `dialin_geo` (phone), `transcription_geo`, and the region of a customer's own recording or transcription storage bucket.

## 2. What our integration does today

- **No region is selected.** The room request our backend sends (`dailyRoomPayload`) contains name, privacy `private`, `nbf`, `exp`, `max_participants`, `eject_at_room_exp`, chat, screenshare, prejoin and knocking: **no `geo`**, and no recording property. The backend has no setting for a region.
- **Read-only look at the Daily domain `ruwadstudio` (2026-10-29):** `geo` is **unset (null)**, so the SFU is chosen by DNS from the first participant's location, and nothing guarantees it stays out of the US. Also: no automatic recording, no transcription, `hipaa` false, `max_webhook_count` 1 (exactly the one webhook we need), 0 webhooks, 0 rooms.
- **So the integration can restrict a region, but only after a change:** (A) set the **domain-level `geo`** in the Daily account, which needs **no code change** because our rooms specify no region and therefore inherit the domain default; or (B) add a one-property **room-level `geo`** to our room request (a small code change plus tests, a new release candidate).

## 3. What regional routing covers, and what it does not

| Data | Where it goes | Controlled by `geo`? |
| --- | --- | --- |
| Live audio, video, screen share (media) and call signalling | the pinned SFU region | **Yes. This is all `geo` governs.** |
| Room and token requests (room name, times, token carrying our user id and display name) | Daily's API, hosted in US AWS | No |
| Logs: client IP addresses, and `user_name` / `user_id` if supplied (we supply both) | Daily's logs in AWS; retention "no longer than necessary", no period published | No |
| Call telemetry and analytics | Daily's analytics sub-processors (BigQuery, Fivetran, Sentry...) | No |
| Webhook events (join/leave: room, session, user id, name, times) | sent **from Daily to our Lightsail backend in Sydney**; they originate in Daily's US systems | No |
| Chat messages in the meeting | Daily states it does not log or store `sendAppMessage()` data | n/a (not stored) |
| Recordings, transcripts | **none are created** (disabled by default; our code never requests them) | n/a |

Daily's data-processing addendum states that its "primary processing operations take place in the United States", and its sub-processor page lists **every** sub-processor as US-hosted. Daily's own material says operational data and metadata are processed in US AWS data centres. **Therefore regional routing keeps the live media in the chosen region; it does not move metadata, logs or account data out of the US.**

## 4. Changes, costs and agreements

- **Technical change needed:** none to our code for option A. One Daily-account setting (`geo`) before the first real room; reversible.
- **Cost:** Daily's documentation lists **no surcharge for `geo`**. That is "not documented", not "confirmed free": ask Daily. The HIPAA add-on (a separate paid package) is not needed for region pinning and is not bought. A region outside the ten, or Canada, requires contacting Daily and may carry commercial terms.
- **Agreements:** Daily publishes a **DPA** (EU/UK/Swiss transfer mechanisms; sub-processor list with 10 days' notice of changes and a right to object; breach notification "without undue delay"; return or deletion of data at the end of service). It **does not mention Saudi Arabia or the PDPL**; it makes the customer responsible for lawful processing. **To confirm with Daily and your counsel:** that a DPA is in force for this account, and how Saudi requirements are to be handled contractually.

## 5. Technical routing is not PDPL compliance

Pinning a region is a technical control over where live media is processed. It does **not** by itself make the service compliant with Saudi PDPL. Compliance concerns the legal basis and notices for the people being recorded or identified, cross-border transfer conditions for **all** personal data (names, ids and IP addresses reach US-hosted systems regardless of `geo`), contracts with the processor, retention, security, breach handling and the controller's own records and responsibilities. None of the Daily documents I read addresses Saudi law. Whether the arrangement, **including US-hosted metadata**, meets PDPL is a question for your counsel; the responsible team's earlier review should be re-read in the light of the facts in section 3 (it may have assumed regional routing covered more than media).

## 6. Recommended configuration (nothing applied)

1. **Pin the region at the domain level (option A): `geo = "eu-central-1"` (Frankfurt).**
   - **Why a region at all:** it is the only way to guarantee the media server is not chosen in the US (for example when one participant connects through a VPN or from abroad).
   - **Why Frankfurt:** connection round-trips measured from this machine in Saudi Arabia (median of 5, to each region's AWS endpoint, as a proxy for the media path): **Frankfurt 113 ms (104 to 164)**, Mumbai 121 ms (76 to 146), London 124 ms, N. Virginia 192 ms, Singapore 276 ms, Cape Town 286 ms. Frankfurt and Mumbai are effectively tied; Frankfurt is steadier. Both are fine for video. Mumbai is the alternative if counsel prefers it. This is one machine and one ISP, so it is indicative.
   - **How (documented request):** `POST https://api.daily.co/v1/` with body `{"properties":{"geo":"eu-central-1"}}`, using the production key; or the Daily dashboard's domain settings. Apply it **before the first real room is created**, and only with your explicit approval.
   - **Verify:** read the domain config (`GET https://api.daily.co/v1/`, `config.geo` must be `eu-central-1`) and, during the smoke test, confirm the session's region in Daily's dashboard. I have not verified whether a room read-back shows an inherited domain `geo`, so treat Daily's dashboard (session details) as the evidence, and check a room read-back too.
   - **Rollback:** set `geo` back to null (how to unset is **not documented**; setting it to `null` is the likely way and must be tried in the window, or use the dashboard).
2. **Optional hardening, not required for launch (option B):** also send `geo` in the room request via a setting, so the region is explicit, versioned and visible on each room. This is a code change and a new release candidate, so it is deferred unless you want it.
3. **Optional data minimisation (code change):** the token currently carries the person's real display name; sending a neutral label ("Advisor" / "Founder") would stop names reaching Daily's logs. Not required; decide with counsel.
4. **Leave off:** recording, transcription, HIPAA add-on (not bought), RTMP, phone dial-in.
5. **Ask Daily in writing:** price of `geo` (expected none), a copy of the executed DPA, and whether metadata or logs can be handled outside the US for this account (the documents say US).

## 7. Which commit to deploy: `5ae8522` or `d90a5b1`

**Deploy `d90a5b1` (or the docs-only commit that follows it), not `5ae8522`.** `git diff 5ae8522 d90a5b1` is exactly one added file, `docs/advisory-execution-checklist.md`, so the **runtime is identical** (the workflow and the site build are unaffected by it). The difference is the record: the commit that reaches `master` should carry the execution checklist and this decision record that the release is approved against; deploying `5ae8522` would leave them only on the side branch. The tip after this investigation is a further **documentation-only** commit; deploy the final tip, and the checklist's push command takes the exact hash (the "verify nothing but docs changed" command below). If you instead choose option B (code), the tip changes runtime code and needs a new test run before approval.

```powershell
git diff --name-only 5ae8522 <tip>          # must list only files under docs\
git diff --name-only 2998868 <tip> | Select-String -NotMatch '^(docs/|backend/scripts/ops/)'   # must print nothing: no runtime change
```

## 8. Reconciliation with the launch checklist

- **Superseded by the owner's approval of Frankfurt (domain-level `geo`) as a technical choice; see `advisory-daily-frankfurt-config.md` and the 12-step order in `advisory-execution-checklist.md`.** In that order the Daily region is **step 8** (after the webhook, before any room exists), the responsible team's review of cross-border processing and PDPL is the **step 9 gate**, and public activation is **step 10**; steps 9 and 10 stay NO-GO until the review is recorded.
- The no-backup risk is unchanged and tracked **separately** (checklist section 2).

## Sources
- [Daily: Create Room (room `geo` and related properties)](https://docs.daily.co/reference/rest-api/rooms/create-room)
- [Daily: Set domain config (domain `geo`)](https://docs.daily.co/reference/rest-api/your-domain/set-domain-config)
- [Daily: Networking guide (region list)](https://docs.daily.co/docs/guides/privacy-and-security/corporate-firewalls-nats-allowed-ip-list)
- [Daily: Data protection](https://www.daily.co/security/data-protection/)
- [Daily: Data Processing Addendum](https://www.daily.co/legal/data-processing-addendum/)
- [Daily: Sub-processors](https://www.daily.co/legal/sub-processors/)
