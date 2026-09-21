/** Build-time feature switches (NEXT_PUBLIC_* values are inlined when the frontend is built).
 *
 * GOOGLE_CALENDAR_DIRECT — "Add to Calendar" straight into the user's Google Calendar
 * (Connect Google Calendar prompt, "✓ Added to Calendar", Settings → Connected Apps).
 * OFF by default: "+ Add to Calendar" then opens Google Calendar / Outlook / Apple links.
 * To turn it on, set NEXT_PUBLIC_GOOGLE_CALENDAR_DIRECT=true, rebuild the frontend, and make
 * sure the backend has its Google credentials (see backend/.env.example). Google must also have
 * verified the OAuth app (or the user must be a listed test user). */
export const GOOGLE_CALENDAR_DIRECT = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_DIRECT === "true";
