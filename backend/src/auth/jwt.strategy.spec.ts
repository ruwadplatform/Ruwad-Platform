import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const payload = (over: Record<string, unknown> = {}) => ({ sub: ID, email: "admin@example.test", role: "RUWAD_ADMIN", ...over }) as never;

function strategy(isActive: (id: string) => Promise<boolean>) {
  const users = { isActive: jest.fn(isActive) };
  const config = { get: () => "unit-test-secret-not-a-real-one" };
  return { s: new JwtStrategy(config as never, users as never), users };
}

describe("JwtStrategy.validate: a session lasts only as long as its account is active", () => {
  it("an active account keeps its session, with exactly the identity and role in the token", async () => {
    const { s, users } = strategy(async () => true);
    await expect(s.validate(payload())).resolves.toEqual({ userId: ID, email: "admin@example.test", role: "RUWAD_ADMIN" });
    expect(users.isActive).toHaveBeenCalledWith(ID);
  });

  it("a deleted (or never-existing) account is rejected with 401, however valid its token is", async () => {
    const { s } = strategy(async () => false);
    await expect(s.validate(payload())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("a suspended account is rejected the same way (isActive is false for any status but ACTIVE)", async () => {
    const { s } = strategy(async () => false);
    await expect(s.validate(payload({ role: "USER" }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("a token without a usable subject is rejected before the database is asked anything", async () => {
    for (const sub of [undefined, null, "", "not-a-uuid", "1; DROP TABLE users", 42, ID + "x", " " + ID]) {
      const { s, users } = strategy(async () => true);
      await expect(s.validate(payload({ sub }))).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.isActive).not.toHaveBeenCalled();
    }
  });

  it("a database failure is NOT turned into a 401, so an outage cannot sign everyone out", async () => {
    const boom = new Error("connection terminated");
    const { s } = strategy(async () => { throw boom; });
    const err = await s.validate(payload()).catch((e) => e);
    expect(err).toBe(boom);
    expect(err).not.toBeInstanceOf(UnauthorizedException);
  });

  it("does not grant or change anything: the role in the result is the token's own", async () => {
    const { s } = strategy(async () => true);
    expect((await s.validate(payload({ role: "USER" }))).role).toBe("USER");
  });
});

describe("JwtStrategy.validate with EMAIL_VERIFICATION_REQUIRED", () => {
  function make(required: boolean, active: boolean, activeAndVerified: boolean) {
    const users = { isActive: jest.fn(async () => active), isActiveAndVerified: jest.fn(async () => activeAndVerified) };
    const config = { get: (k: string) => (k === "EMAIL_VERIFICATION_REQUIRED" ? (required ? "true" : undefined) : "unit-test-secret-not-a-real-one") };
    return { s: new JwtStrategy(config as never, users as never), users };
  }

  it("off: an active account keeps its session and verification is never consulted (unchanged behaviour)", async () => {
    const { s, users } = make(false, true, false);
    await expect(s.validate(payload())).resolves.toMatchObject({ userId: ID });
    expect(users.isActiveAndVerified).not.toHaveBeenCalled();
  });

  it("on: an active but UNVERIFIED account is refused with 401, however valid its token is", async () => {
    const { s } = make(true, true, false);
    await expect(s.validate(payload())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("on: an active and verified account keeps its session", async () => {
    const { s, users } = make(true, true, true);
    await expect(s.validate(payload())).resolves.toMatchObject({ userId: ID, role: "RUWAD_ADMIN" });
    expect(users.isActive).not.toHaveBeenCalled();
  });

  it("on: a suspended account is still refused", async () => {
    const { s } = make(true, false, false);
    await expect(s.validate(payload())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
