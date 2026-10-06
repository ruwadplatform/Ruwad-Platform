import { BadRequestException } from "@nestjs/common";
import { signEmailAction } from "../email/email-action-token";
import { SubmissionEmailActionController } from "./submission-email-action.controller";

const SECRET = "test-secret";

function controller(decide: jest.Mock = jest.fn(async () => ({ title: "Acme", status: "APPROVED" }))) {
  const submissions: any = { findOneAdmin: jest.fn(async () => ({ title: "Acme" })), decideFromEmail: decide };
  const users: any = { findFirstAdmin: jest.fn(async () => ({ id: "admin-1" })) };
  const config: any = { get: (k: string) => (k === "JWT_SECRET" ? SECRET : undefined) };
  return { ctl: new SubmissionEmailActionController(submissions, users, config), submissions };
}
const tok = (act: "approve" | "reject" | "changes") => signEmailAction("sub-1", act, SECRET);

describe("admin email action pages", () => {
  it("the 'request changes' link opens a page that requires a message and changes nothing by itself", async () => {
    const { ctl, submissions } = controller();
    const html = await ctl.confirm(tok("changes"));
    expect(html).toContain('Request changes to "Acme"?');
    expect(html).toMatch(/<textarea[^>]*required/);
    expect(html).toContain("Confirm change request");
    expect(submissions.decideFromEmail).not.toHaveBeenCalled();
  });

  it("the approve link says it publishes the startup", async () => {
    const { ctl } = controller();
    const html = await ctl.confirm(tok("approve"));
    expect(html).toContain("publishes the startup");
    expect(html).not.toContain("<textarea");
  });

  it("confirming a change request passes the message through and tells the admin the submitter was asked", async () => {
    const decide = jest.fn(async () => ({ title: "Acme", status: "CHANGES_REQUESTED" }));
    const { ctl } = controller(decide);
    const html = await ctl.decide(tok("changes"), "Add the CR number");
    expect(decide).toHaveBeenCalledWith("admin-1", "sub-1", "changes", "Add the CR number");
    expect(html).toContain("Changes requested");
  });

  it("an empty change request is refused with a clear message", async () => {
    const decide = jest.fn(async () => { throw new BadRequestException("Describe what the submitter should change."); });
    const { ctl } = controller(decide);
    const html = await ctl.decide(tok("changes"), "");
    expect(html).toContain("Nothing was changed");
    expect(html).toContain("Describe what the submitter should change");
  });

  it("approving from the email reports that the startup is live", async () => {
    const { ctl } = controller();
    const html = await ctl.decide(tok("approve"));
    expect(html).toContain("Submission accepted");
    expect(html).toContain("now live");
  });

  it("an invalid or tampered link does nothing", async () => {
    const { ctl, submissions } = controller();
    expect(await ctl.decide(tok("approve") + "x")).toContain("invalid or has expired");
    expect(submissions.decideFromEmail).not.toHaveBeenCalled();
  });
});
