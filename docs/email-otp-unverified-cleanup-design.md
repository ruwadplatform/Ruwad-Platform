# Unverified accounts: audit and safe-cleanup design (DESIGN ONLY, nothing is implemented)

Decision D4 (owner): expired codes may be cleaned automatically (done: rows older than 7 days are deleted opportunistically, at most once an hour). **Unverified accounts are NOT deleted automatically** until related records are audited and a safe cleanup is designed. This is that audit and design.

## 1. Audit: what points at a user account

Schema read from the migrated local database (production has the same schema).

- **Real foreign keys to `users` (5), all `ON DELETE CASCADE`:** `calendar_event_links`, `email_verification_codes`, `google_calendar_connections`, `password_reset_tokens`, `user_settings`.
- **Plain user-id columns with NO foreign key (29 tables/columns):** `activity_logs.userId`, `advisory_advisors.userId` and `.reviewedByUserId`, `advisory_application_events.actorUserId`, `advisory_booking_events.actorUserId`, `advisory_bookings.requestedByUserId`, `advisory_meeting_attendance.userId`, `advisory_presence_events.userId`, `data_room_access_requests.userId`, `entity_memberships.userId`, `introductions.userId`, `listing_claims.userId` and `.reviewedByUserId`, `ml_training_runs.createdBy`, `report_submissions.userId` and `.reviewedByUserId`, `saved_searches.userId`, `startup_feature_applicability.createdBy`, `startup_founder_career.createdBy`, `startup_historical_evidence.createdBy`, `startup_historical_evidence_audit.adminUserId`, `startup_historical_submissions.submittedBy`, `startup_outcome_coverage.createdBy`, `startup_outcome_events.createdByUserId`, `startup_scoring_feature_audit.adminUserId`, `submission_review_events.actorUserId`, `submissions.userId` and `.reviewedByUserId`, `watchlist_items.userId`, and `email_verification_audit.userId` (kept on purpose).

**Consequence:** deleting a user row does not remove or block on any of those 29 references. A deleted account would leave orphaned records pointing at an id that no longer exists. Deletion is therefore only safe for an account that provably has none.

## 2. What an unverified account can have

While verification is enforced an unverified person cannot sign in, so the account can only ever hold: its `users` row, `user_settings` (created at sign-up), `email_verification_codes`, and possibly `password_reset_tokens` (the reset flow works for unverified accounts). Nothing in the 29 plain-id references should exist. Accounts that existed before enforcement are all grandfathered as verified by the migration, so none of them are candidates.

## 3. Why deletion is optional

Signing up again with the same address **overwrites** a still-unverified account (this is the pre-hijack protection), so an old unverified row never blocks the real owner of the address. The only cost of leaving rows is a small amount of storage and noise in counts. Recommendation: **do not delete anything at launch**; look at the real volume after a few weeks and decide.

## 4. If cleanup is wanted later (proposed design)

A guarded operations script (same discipline as the migration and verify tools), **not** a scheduled job at first:

1. `plan` (read-only, default) lists how many accounts qualify and shows masked addresses; `apply` needs an exact confirmation phrase, an operator name and a reason, and processes at most 100 accounts per run.
2. An account qualifies only if **all** of: `emailVerifiedAt` is null and `emailVerifiedVia` is null; status ACTIVE; created more than 30 days ago; no code row was ever consumed; and **zero** rows in every table above that references users.
3. The reference check is **fail-closed**: the script reads the list of user-referencing columns from the database catalogue and compares it with a checked-in list. If a table appears that the list does not know, the script refuses to run until someone has looked.
4. The delete statement repeats every condition (`NOT EXISTS` for each reference) in the same transaction, so an account that verified or gained a record a moment earlier is skipped.
5. Each run writes an audit row (`UNVERIFIED_DELETED`, count, operator, reason). Cascades remove the codes, settings and reset tokens.

## 5. Decision needed

None now. If you want this later, approve the design (or change the 30-day and 100-account limits) and I will implement and rehearse it locally like the other tools.
