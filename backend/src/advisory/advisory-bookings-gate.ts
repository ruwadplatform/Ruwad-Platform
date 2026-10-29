import { CanActivate, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** The booking switch. Consultation bookings are OFF unless ADVISORY_BOOKINGS_ENABLED is exactly "true" (and Advisory itself is on), so a deployment that
 * has never heard of this variable behaves as "bookings unavailable". Everything else (the directory, profiles, applications, the advisor dashboard, the
 * admin console) is unaffected by it. Turning bookings on later is this one variable and a restart: no code change, no migration, no frontend build. */
export const bookingsEnabled = (get: (key: string) => string | undefined): boolean =>
  get("ADVISORY_ENABLED")?.trim() === "true" && get("ADVISORY_BOOKINGS_ENABLED")?.trim() === "true";

/** The stable code the screens look for. The text is the exact message shown to people (the frontend carries the same words for the moments it
 * decides without asking the server). */
export const BOOKINGS_DISABLED_CODE = "BOOKINGS_DISABLED";
export const BOOKINGS_DISABLED_MESSAGE = "Online consultation booking is currently unavailable. Please contact the RUWĀD team to arrange your consultation.";

/** HTTP 403 with a controlled body: { statusCode, error, code, message }. Thrown before anything is written, held, emailed or created. */
export class BookingsDisabledException extends ForbiddenException {
  constructor() {
    super({ statusCode: 403, error: "Forbidden", code: BOOKINGS_DISABLED_CODE, message: BOOKINGS_DISABLED_MESSAGE });
  }
}

/** On every route that would create a booking, hold a slot, confirm a booking, propose or accept a new time, or open a meeting room. It runs after the
 * sign-in guard (a signed-out caller is still told to sign in) and before the handler, so nothing is read, written, emailed or sent to the video provider. */
@Injectable()
export class AdvisoryBookingsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(): boolean {
    if (!bookingsEnabled((k) => this.config.get<string>(k))) throw new BookingsDisabledException();
    return true;
  }
}
