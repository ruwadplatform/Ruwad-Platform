# Advisory Services: privacy notice inputs (DRAFT for the owner and counsel)

Status: a statement of what the system does today, written from the code. **It is not legal advice and not a PDPL assessment.** The Daily.co cross-border/PDPL review stays DEFERRED and NOT APPROVED; this notice is about advisor applications only, because with online booking switched off no meeting, and so no Daily.co processing, can happen.

## 1. What is collected (advisor and professor applications)

| Data | Where it comes from | Who can see it |
| --- | --- | --- |
| Account: name, email, password (stored hashed) | Sign-up | The person; RUWĀD administrators |
| Application: name, email, phone, designation, institution, city and country, specialization(s), years of experience, biography, research areas, optional services text, preferred duration, optional LinkedIn and website links, the declaration and when it was accepted | Application form | RUWĀD administrators. A subset becomes public if approved (below) |
| Documents: CV (PDF), optional certificates (PDF, PNG, JPG), optional photograph (PNG, JPG) | Application form | RUWĀD administrators only, as downloads. Never on the public profile |
| Application history: submitted, notifications, decision, reviewer's note, reference number | The system and administrators | Administrators. The applicant sees their own status and the reason for a rejection |

Public profile, only after an administrator approves: name, designation, institution (shown as "listed affiliation, not verified"), location, specializations, years of experience, research areas, biography, and the consultation services and open times the advisor sets. Not displayed on the public profile: email, phone, CV, certificates, photograph, review notes.

## 2. Where it goes

- **Database:** application data and the documents themselves are stored in the production PostgreSQL database (Supabase, Sydney region), not on disk.
- **Backend:** AWS Lightsail (Sydney). **Website and proxy:** Vercel.
- **Email:** Resend sends from `ruwadplatform@karama.tech`. A notification with the applicant's name, email, phone, institution, designation and specialization goes to the team inbox `ruwadplatform@gmail.com`; the applicant receives decision emails (a rejection includes the reviewer's reason) at their account address.
- **Not involved at launch:** Daily.co (no meetings), payment providers (no payments or fees).

## 3. How the screens describe it today

The application form shows: your documents are private (administrators only, never on the public profile); a "How your information is used" box with who sees what, the email behaviour and the contact address `ruwadplatform@gmail.com`; and the declaration. The box ends by saying it does not replace RUWĀD's full Privacy Policy (which does not yet exist as a published page: see section 4, item 1). These statements are in `frontend/src/features/advisory/advisor-notices.ts` and make no promise about retention, deletion or legal basis.

## 4. Decisions only the owner and counsel can make

1. **Terms of Use and Privacy Policy.** No such pages exist on the site (`/privacy`, `/terms`, `/legal`, `/contact` all return 404), and the sign-up box "I agree to RUWĀD Terms of Use and Privacy Policy" is unlinked text. This is true for the whole platform, not only Advisory.
2. **Retention.** Nothing deletes applications or documents. A rejected applicant's earlier application stays on record for "Edit and Reapply". Decide how long data is kept.
3. **Corrections and removal.** Decide who handles a request, how quickly, and what happens to a published profile. There is no self-service removal and no deletion tool; there is also no verified backup (owner-accepted risk).
4. **Legal basis and cross-border wording** for the processors in section 2 (Resend, Vercel, Gmail and the Sydney-hosted database and backend), and the data controller's name and contact.
5. Whether the team inbox, a Gmail account, is an acceptable place for application details including phone numbers.

## 5. If the notice changes

Change `advisor-notices.ts` and this file together, and tell advisors who already applied if the change matters to them.
