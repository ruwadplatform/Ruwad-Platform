/** Plain template-literal HTML emails — no templating library, per the
 * product spec. One shared layout wrapper + a details-table helper, reused
 * by all four notification templates below. All dynamic values are
 * HTML-escaped since they include user-entered text (names, profile
 * titles, messages). */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(heading: string, bodyHtml: string, cta?: { text: string; url: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F6F7FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#15201B;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #E3E6E2;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#080A1F;padding:20px 28px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.02em;">RUWĀD</span>
          </td></tr>
          <tr><td style="padding:28px;">
            <h1 style="margin:0 0 12px;font-size:19px;font-weight:700;line-height:1.3;">${escapeHtml(heading)}</h1>
            <div style="font-size:14px;line-height:1.6;color:#3a4440;">${bodyHtml}</div>
            ${cta ? `<div style="margin-top:24px;"><a href="${cta.url}" style="display:inline-block;background:#128A45;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(cta.text)}</a></div>` : ""}
          </td></tr>
          <tr><td style="padding:18px 28px;border-top:1px solid #E3E6E2;font-size:12px;color:#8B978E;">
            RUWĀD — Saudi &amp; MENA Healthcare Innovation Ecosystem<br/>
            This is an automated notification from the RUWĀD platform.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function detailsTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:13px;">
    ${rows.map(([label, value]) => `<tr><td style="padding:6px 0;color:#5C6B62;width:40%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`).join("")}
  </table>`;
}

export function startupSubmissionReceivedTemplate(p: {
  startupName: string; submitterName: string; submitterEmail: string;
  category: string; stage: string; submissionId: string; submittedAt: string; reviewUrl: string;
}): string {
  const body =
    `<p>A new startup registration has been submitted and is awaiting review.</p>` +
    detailsTable([
      ["Startup Name", p.startupName],
      ["Submitter", p.submitterName],
      ["Submitter Email", p.submitterEmail],
      ["Healthcare Sector", p.category],
      ["Stage", p.stage],
      ["Submission ID", p.submissionId],
      ["Submitted", p.submittedAt],
    ]);
  return layout("New Startup Submission", body, { text: "Review Submission", url: p.reviewUrl });
}

export function dataRoomRequestedTemplate(p: {
  requesterName: string; requesterEmail: string; profileName: string;
  requestType: string; requestedAt: string; reviewUrl: string;
}): string {
  const body =
    `<p>Someone has requested Data Room access to a profile you own on RUWĀD.</p>` +
    detailsTable([
      ["Requester", p.requesterName],
      ["Requester Email", p.requesterEmail],
      ["Profile", p.profileName],
      ["Request Type", p.requestType],
      ["Requested", p.requestedAt],
    ]);
  return layout("New Data Room Access Request", body, { text: "Review Request", url: p.reviewUrl });
}

export function dataRoomReviewedTemplate(p: {
  profileName: string; approved: boolean; reviewedAt: string; profileUrl: string;
}): string {
  const body =
    `<p>Your Data Room access request has been ${p.approved ? "approved" : "declined"}.</p>` +
    detailsTable([
      ["Profile", p.profileName],
      ["Status", p.approved ? "Approved" : "Declined"],
      ["Reviewed", p.reviewedAt],
    ]);
  return layout(`Data Room Access ${p.approved ? "Approved" : "Declined"}`, body, { text: "View Profile", url: p.profileUrl });
}

export function introductionStatusChangedTemplate(p: {
  targetName: string; statusLabel: string; message?: string; introUrl: string;
}): string {
  const rows: [string, string][] = [["Target", p.targetName], ["Status", p.statusLabel]];
  if (p.message) rows.push(["Message", p.message]);
  const body = `<p>Your introduction request status has been updated.</p>` + detailsTable(rows);
  return layout("Introduction Request Update", body, { text: "View Introduction Requests", url: p.introUrl });
}
