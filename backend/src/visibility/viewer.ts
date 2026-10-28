import type { AuthUser } from "../common/decorators/current-user.decorator";
import { UserRole } from "../common/enums";

/** What the caller of a public read endpoint is allowed to see. Resolved on the server from the signed session cookie, never from anything the client says about itself.
 *  - public: nobody signed in (a visitor, a search-engine crawler, a script)
 *  - member: any signed-in account that is not an administrator — what the screens unlock behind "Sign in" today
 *  - owner:  a member who owns THIS record (decided per record, see AccessService)
 *  - admin:  RUWĀD administrators */
export type Access = "public" | "member" | "owner" | "admin";

export interface Viewer {
  userId: string | null;
  role: string | null;
}

export const GUEST: Viewer = { userId: null, role: null };

export function viewerFromUser(user: Partial<AuthUser> | null | undefined): Viewer {
  if (!user?.userId) return GUEST;
  return { userId: user.userId, role: user.role ?? null };
}

export const isAdminRole = (role: string | null | undefined): boolean => role === UserRole.RUWAD_ADMIN || role === UserRole.SUPER_ADMIN;

/** The access level a viewer has on a record they do NOT own. */
export function baseAccess(viewer: Viewer): Access {
  if (!viewer.userId) return "public";
  return isAdminRole(viewer.role) ? "admin" : "member";
}
