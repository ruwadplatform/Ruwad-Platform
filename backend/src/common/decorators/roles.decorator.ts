import { SetMetadata } from "@nestjs/common";
import { UserRole } from "../enums";

export const ROLES_KEY = "roles";
/** Marks a route as requiring one of the given roles — enforced by
 * RolesGuard, never by the frontend. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
