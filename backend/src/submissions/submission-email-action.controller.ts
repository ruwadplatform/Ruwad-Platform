import { Body, Controller, Get, Header, HttpCode, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { ApiExcludeController } from "@nestjs/swagger";
import { SubmissionsService } from "./submissions.service";
import { UsersService } from "../users/users.service";
import { verifyEmailAction } from "../email/email-action-token";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F6F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#15201B;">
<div style="max-width:460px;margin:60px auto;background:#fff;border:1px solid #E3E6E2;border-radius:8px;padding:28px;">
<div style="font-weight:700;letter-spacing:.02em;margin-bottom:16px;">RUWĀD</div>${inner}</div></body></html>`;
}

/** Public (no login) endpoints behind the Accept/Reject buttons in the admin
 * email. GET only *shows* a confirmation page — it never changes anything,
 * so mail scanners that pre-fetch links can't approve or reject by accident.
 * The decision itself is a POST carrying the signed, expiring token. */
@ApiExcludeController()
@Controller("email-actions")
export class SubmissionEmailActionController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string { return this.config.get<string>("JWT_SECRET") ?? ""; }

  @Get("submission")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async confirm(@Query("token") token?: string): Promise<string> {
    const p = verifyEmailAction(token, this.secret());
    if (!p) return page("Link invalid", "<h2>This link is invalid or has expired</h2><p>Open the RUWĀD admin panel to review this submission.</p>");
    let name = "this submission";
    try { name = String((await this.submissions.findOneAdmin(p.sid)).title ?? name); } catch { /* shown generically */ }
    const approve = p.act === "approve";
    return page(approve ? "Accept submission" : "Reject submission", `
<h2 style="margin:0 0 8px;">${approve ? "Accept" : "Reject"} "${esc(name)}"?</h2>
<p style="color:#3a4440;font-size:14px;">${approve ? "This publishes the startup to the RUWĀD directory and makes the submitter its owner." : "The submitter will see that the listing was not approved."}</p>
<form method="POST" action="">
<input type="hidden" name="token" value="${esc(token!)}">
${approve ? "" : '<label style="font-size:13px;">Reason (shown to the submitter)<br><textarea name="reason" rows="3" maxlength="2000" style="width:100%;margin-top:6px;box-sizing:border-box;"></textarea></label><br><br>'}
<button type="submit" style="background:${approve ? "#128A45" : "#C0392B"};color:#fff;border:0;border-radius:6px;padding:12px 26px;font-weight:600;font-size:14px;cursor:pointer;">Confirm ${approve ? "acceptance" : "rejection"}</button>
</form>`);
  }

  @Post("submission")
  @HttpCode(200)
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async decide(@Body("token") token?: string, @Body("reason") reason?: string): Promise<string> {
    const p = verifyEmailAction(token, this.secret());
    if (!p) return page("Link invalid", "<h2>This link is invalid or has expired</h2>");
    try {
      const admin = await this.users.findFirstAdmin();
      if (!admin) return page("No admin", "<h2>No active admin account exists</h2><p>Sign in to RUWĀD to review this submission.</p>");
      const done = await this.submissions.decideFromEmail(admin.id, p.sid, p.act, reason);
      return page("Done", `<h2 style="margin:0 0 8px;">${p.act === "approve" ? "Submission accepted" : "Submission rejected"}</h2><p style="color:#3a4440;font-size:14px;">"${esc(String(done.title ?? "Submission"))}" is now ${done.status}.</p>`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      return page("Not changed", `<h2 style="margin:0 0 8px;">Nothing was changed</h2><p style="color:#3a4440;font-size:14px;">${esc(msg)}</p><p style="font-size:13px;color:#5C6B62;">If it was already reviewed, this link has no further effect.</p>`);
    }
  }
}
