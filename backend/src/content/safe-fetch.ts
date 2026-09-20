import * as dns from "dns";
import * as http from "http";
import * as https from "https";
import { isIP } from "net";

const MAX_BYTES = 400 * 1024;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local (incl. cloud metadata), CGNAT and
 * other non-public addresses — never something an event page should live on. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

function allowPrivate(): boolean {
  // Only ever honoured outside production (local tests hit a fake on 127.0.0.1).
  return process.env.NODE_ENV !== "production" && process.env.CONTENT_ALLOW_PRIVATE_FETCH === "true";
}

/** Validates addresses at connect time (not just before), so a hostname that
 * re-resolves to an internal address between check and use is still refused. */
function guardedLookup(hostname: string, options: any, cb: any): void {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = (addrs as dns.LookupAddress[]).filter((a) => allowPrivate() || !isPrivateAddress(a.address));
    if (!ok.length) return cb(new Error("Blocked address"));
    if (options?.all) return cb(null, ok);
    return cb(null, ok[0].address, ok[0].family);
  });
}

function getOnce(url: URL): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method: "GET", lookup: guardedLookup as any, timeout: TIMEOUT_MS, headers: { "User-Agent": "RUWAD-ContentBot/1.0 (+healthcare ecosystem directory)", Accept: "text/html,application/xhtml+xml" } }, (res) => {
      const status = res.statusCode ?? 0;
      const contentType = String(res.headers["content-type"] ?? "");
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: String(res.headers.location ?? ""), contentType, body: "" }); }
      if (status !== 200 || !/text\/html|application\/xhtml/i.test(contentType)) { res.resume(); return resolve({ status, contentType, body: "" }); }
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; if (size > MAX_BYTES) { res.destroy(); return; } chunks.push(c); });
      const done = () => resolve({ status, contentType, body: Buffer.concat(chunks).toString("utf8") });
      res.on("end", done); res.on("close", done);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** Fetches an HTML page with SSRF protection, a size cap, a timeout and a
 * redirect limit. Returns null on anything unusual — callers treat a page we
 * couldn't read as "no extra information", never as an error. */
export async function fetchHtml(rawUrl: string): Promise<{ finalUrl: string; html: string } | null> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (isIP(url.hostname) && !allowPrivate() && isPrivateAddress(url.hostname)) return null;
    let res;
    try { res = await getOnce(url); } catch { return null; }
    if (res.status >= 300 && res.status < 400 && res.location) {
      try { url = new URL(res.location, url); } catch { return null; }
      continue;
    }
    return res.body ? { finalUrl: url.toString(), html: res.body } : null;
  }
  return null;
}
