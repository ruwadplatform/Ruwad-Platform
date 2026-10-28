import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

const PASSWORD = "Correct-Horse-1!";
const hash = bcrypt.hashSync(PASSWORD, 4);

function service(user: Record<string, unknown> | null) {
  const users = { findByEmail: jest.fn(async () => user) };
  return new AuthService(users as never, {} as never, {} as never, {} as never, {} as never);
}
const account = (status: string) => ({ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", email: "a@example.test", passwordHash: hash, role: "USER", status });

describe("AuthService.validateCredentials", () => {
  it("an ACTIVE account with the right password signs in", async () => {
    await expect(service(account("ACTIVE")).validateCredentials({ email: "a@example.test", password: PASSWORD })).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("a SUSPENDED account is refused even with the right password", async () => {
    const err = await service(account("SUSPENDED")).validateCredentials({ email: "a@example.test", password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toMatch(/not active/i);
  });

  it("a wrong password still gets the generic message, whatever the status (nothing about the account is revealed)", async () => {
    for (const status of ["ACTIVE", "SUSPENDED"]) {
      const err = await service(account(status)).validateCredentials({ email: "a@example.test", password: "wrong" }).catch((e) => e);
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toBe("Invalid email or password");
    }
  });

  it("an unknown (for example deleted) account gets the same generic message", async () => {
    const err = await service(null).validateCredentials({ email: "gone@example.test", password: PASSWORD }).catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe("Invalid email or password");
  });
});
