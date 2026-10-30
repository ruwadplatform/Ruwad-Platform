import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { EmailService } from "./email.service";

const config = (vars: Record<string, string | undefined>) => ({ get: (k: string) => vars[k] }) as never;

describe("EMAIL_DEV_OUTBOX_FILE is development only and cannot be switched on where real mail can be sent", () => {
  const dir = mkdtempSync(join(tmpdir(), "ruwad-outbox-test-"));
  const file = join(dir, "outbox.jsonl");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("the service refuses to start with it in production", () => {
    expect(() => new EmailService(config({ NODE_ENV: "production", EMAIL_DEV_OUTBOX_FILE: file }))).toThrow(/local development only/);
  });

  it("refuses it alongside a Resend key, whatever NODE_ENV says", () => {
    for (const env of ["development", "test", undefined]) {
      expect(() => new EmailService(config({ NODE_ENV: env, RESEND_API_KEY: "re_not_a_real_key", EMAIL_DEV_OUTBOX_FILE: file }))).toThrow(/local development only/);
    }
  });

  it("refuses a relative path or one that is not .jsonl", () => {
    expect(() => new EmailService(config({ NODE_ENV: "development", EMAIL_DEV_OUTBOX_FILE: "outbox.jsonl" }))).toThrow();
    expect(() => new EmailService(config({ NODE_ENV: "development", EMAIL_DEV_OUTBOX_FILE: join(dir, "outbox.txt") }))).toThrow();
  });

  it("in development, with no Resend key, appends each email to the file instead of sending it", async () => {
    const svc = new EmailService(config({ NODE_ENV: "development", EMAIL_DEV_OUTBOX_FILE: file, EMAIL_FROM: "RUWĀD <x@example.test>" }));
    expect(await svc.sendEmailVerificationCode({ to: "a@example.test", firstName: "Ada", code: "123456", minutes: 10 })).toBe(true);
    expect(await svc.sendExistingAccountNotice({ to: "b@example.test", firstName: "Bo" })).toBe(true);
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ to: "a@example.test", subject: "Your RUWĀD verification code" });
    expect(lines[0].html).toContain("123456"); // the code is in the body (this is the local file a developer reads)
    expect(lines[0].subject).not.toContain("123456"); // and never in the subject, which is what gets logged
    expect(lines[1]).toMatchObject({ to: "b@example.test", subject: "You already have a RUWĀD account" });
  });

  it("without the outbox and without a key nothing is written or sent (unchanged behaviour)", async () => {
    const other = join(dir, "never-created.jsonl");
    const svc = new EmailService(config({ NODE_ENV: "development" }));
    expect(await svc.sendEmailVerificationCode({ to: "a@example.test", firstName: "Ada", code: "123456", minutes: 10 })).toBe(false);
    expect(existsSync(other)).toBe(false);
  });
});
