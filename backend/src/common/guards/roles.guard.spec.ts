import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard } from "./roles.guard";
import { UserRole } from "../enums";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { HistoricalDataController } from "../../ml-data/historical/historical-data.controller";

function fakeContext(user: { role: UserRole } | undefined, handler: (...args: unknown[]) => unknown, cls: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard — protects every admin-only route, including the new historical-data routes", () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it("rejects a request with no authenticated user", () => {
    const ctx = fakeContext(undefined, HistoricalDataController.prototype.listBatches, HistoricalDataController);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it("rejects a non-admin role (e.g. a regular USER) on an admin-only route", () => {
    const ctx = fakeContext({ role: UserRole.USER }, HistoricalDataController.prototype.listBatches, HistoricalDataController);
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it("rejects FOUNDER and INVESTOR roles too — only RUWAD_ADMIN/SUPER_ADMIN are allowed", () => {
    expect(guard.canActivate(fakeContext({ role: UserRole.FOUNDER }, HistoricalDataController.prototype.listBatches, HistoricalDataController))).toBe(false);
    expect(guard.canActivate(fakeContext({ role: UserRole.INVESTOR }, HistoricalDataController.prototype.listBatches, HistoricalDataController))).toBe(false);
  });

  it("allows RUWAD_ADMIN and SUPER_ADMIN through", () => {
    expect(guard.canActivate(fakeContext({ role: UserRole.RUWAD_ADMIN }, HistoricalDataController.prototype.listBatches, HistoricalDataController))).toBe(true);
    expect(guard.canActivate(fakeContext({ role: UserRole.SUPER_ADMIN }, HistoricalDataController.prototype.listBatches, HistoricalDataController))).toBe(true);
  });

  it("the @Roles metadata is actually present on HistoricalDataController (catches a missing/removed decorator)", () => {
    const required = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [HistoricalDataController.prototype.listBatches, HistoricalDataController]);
    expect(required).toEqual([UserRole.RUWAD_ADMIN, UserRole.SUPER_ADMIN]);
  });
});
