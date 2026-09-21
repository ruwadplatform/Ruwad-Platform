import type { TextUnit } from "../common/pitch-deck-text";
import type { EvidenceItem } from "./autofill-pipeline";

/** "No-AI" reading of a pitch deck: strict patterns over the deck's own text, used when no AI key is configured.
 * It only reports what the deck says in a recognisable form (labels like "Founded: 2021", "SFDA approved", "Name — CEO",
 * "Raised USD 2M"), quoting the exact text as evidence. Narrative fields (problem, solution, description…) are left for the
 * user unless the deck labels them. Results go through the same grounding checks as AI answers. */

export interface LocalExtraction { fields: Record<string, unknown>; evidence: EvidenceItem[] }

const SOCIAL = /(linkedin|facebook|instagram|twitter|x\.com|youtube|tiktok|github|medium|google|apple|calendly|zoom|gmail|outlook|hotmail|yahoo|icloud|proton|live\.com|msn)\./i;
const PLACEHOLDER_EMAIL = /(example\.(com|org)|yourcompany|email@|name@|test@|@domain\.)/i;
const GENERIC_HEADING = /^(pitch\s?deck|investor\s?(deck|presentation)|presentation|confidential|introduction|agenda|overview|table of contents|company overview|about us|our story|thank you|contact|seed round|series [a-d]|fundraising|business plan|executive summary|slide \d+|section \d+)\b/i;
const TITLE = /\b(CEO|CTO|COO|CFO|CMO|CIO|CSO|CPO|Chief [A-Z][a-z]+ Officer|Co-?Founder|Founder|Managing Director|Managing Partner|President|Vice President|VP(?: of)? [A-Za-z ]+|Head of [A-Za-z ]+|Director(?: of [A-Za-z ]+)?|Medical Director|Lead [A-Za-z ]+|Chairman|Advisor|Board Member)\b/;

const UNIT: Record<string, number> = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };
const CATEGORY_WORDS: Record<string, RegExp> = {
  "Digital Health": /digital health|telehealth|remote (patient )?monitoring|health app|patient portal|e-?health|digital therapeutic/gi,
  Telemedicine: /telemedicine|virtual (care|consult)|online consult/gi,
  Biotechnology: /biotech|bioprocess|cell therapy|gene therapy|biologic|bioreactor/gi,
  Diagnostics: /diagnostic|assay|point[- ]of[- ]care test|biomarker|screening test|lab test/gi,
  "Medical Devices": /medical device|wearable|implant|sensor device|surgical (tool|robot)/gi,
  "AI Healthcare": /machine learning|artificial intelligence|deep learning|\bAI[- ](powered|driven|based)|computer vision/gi,
  Pharmaceuticals: /pharmaceutical|drug (discovery|development)|generic medicines|clinical formulation/gi,
  Genomics: /genomic|genome|sequencing|genetic (test|screening)/gi,
  "Healthcare IT": /electronic health record|\bEMR\b|\bEHR\b|hospital information system|interoperab/gi,
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
function amountOf(num: string, unit?: string): number { return Number(num.replace(/,/g, "")) * (UNIT[(unit ?? "").toLowerCase()] ?? 1); }
function stageOf(raw: string): string | undefined {
  const r = raw.toLowerCase().replace(/[\s-]/g, "");
  if (r.startsWith("preseed")) return "Pre-Seed"; if (r === "seed") return "Seed";
  const m = /^series([a-d])\+?$/.exec(r); return m ? (m[1] === "a" ? "Series A" : m[1] === "b" ? "Series B" : "Series C+") : undefined;
}

export function localExtract(units: TextUnit[], startupFields: boolean): LocalExtraction {
  const text = units.map((u) => u.text).join("\n");
  const lines = text.split("\n").map((l) => clean(l)).filter(Boolean);
  const first = (units[0]?.text ?? "").split("\n").map(clean).filter(Boolean);
  const f: Record<string, unknown> = {};
  const evidence: EvidenceItem[] = [];
  const ev = (field: string, quote: string) => evidence.push({ field, quote: clean(quote).slice(0, 300) });
  const labelled = (label: RegExp): string | undefined => { for (const l of lines) { const m = new RegExp(`^(?:${label.source})\\s*[:\\-–]\\s*(.{2,300})$`, "i").exec(l); if (m) return m[1].trim(); } return undefined; };

  /* ---- contacts and links (any kind of submission) ---- */
  const emails = [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0]).filter((e) => !PLACEHOLDER_EMAIL.test(e));
  if (emails[0]) f.email = emails[0];
  const linkedin = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9._-]+/i.exec(text)?.[0];
  if (linkedin) f.linkedin = linkedin;
  const emailHost = emails[0]?.split("@")[1]?.toLowerCase();
  const sites = [...text.matchAll(/(?<![@\w.-])(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/[^\s)]*)?/gi)]
    .map((m) => ({ raw: m[0], host: m[1].toLowerCase() })).filter((s) => /\.[a-z]{2,}$/.test(s.host) && !SOCIAL.test(s.host + ".") && !s.host.includes("@") && !/\.(png|jpg|pdf|pptx)$/i.test(s.host));
  const site = sites.find((s) => emailHost && (s.host === emailHost || s.host.endsWith("." + emailHost))) ?? sites[0];
  if (site) f.website = /^https?:/i.test(site.raw) ? site.raw.replace(/[.,;]+$/, "") : `https://${site.raw.replace(/[.,;]+$/, "")}`;
  const phone = /\+\d[\d\s().-]{7,17}\d/.exec(text)?.[0];
  if (phone) f.phone = clean(phone);

  /* ---- company name ---- */
  let name = labelled(/company(?: name)?|startup|organization/);
  if (!name) { const h = first.find((l) => l.startsWith("# ")); if (h && !GENERIC_HEADING.test(h.slice(2))) name = h.slice(2); }
  if (!name) { const c = /©\s*(?:\d{4}\s*)?([A-Z][\p{L}\d&.' -]{2,40}?)(?=\.|,|\s+All rights|\s*$)/u.exec(text)?.[1]; if (c) name = c.trim(); }
  if (!name) name = first.find((l) => l.length <= 40 && l.split(" ").length <= 5 && /^[A-Z]/.test(l) && !/[@:/\d]/.test(l) && !GENERIC_HEADING.test(l));
  if (!name && emailHost) name = emailHost.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  if (name) f.name = name.replace(/^#\s*/, "").replace(/\s*[|–—-]\s*(pitch deck|investor deck|presentation).*$/i, "").trim();

  if (!startupFields) return { fields: f, evidence };

  /* ---- facts stated in a recognisable form ---- */
  const founded = /\b(?:founded|established|est\.?|since|incorporated)\s*(?:in\s*)?(19[89]\d|20[0-4]\d)\b/i.exec(text);
  if (founded) { f.founded = Number(founded[1]); ev("founded", founded[0]); }
  const emp = /\b(\d{1,5})\+?\s*(?:full[- ]time\s+)?(?:employees|team members|staff|people)\b/i.exec(text) ?? /\bteam of (\d{1,5})\b/i.exec(text);
  if (emp) { f.employees = Number(emp[1]); ev("employees", emp[0]); }
  const hq = /(?:[Hh]eadquarter(?:ed|s)?(?:\s+in|:)|\b(?:HQ|hq)\s*[:\-–]|\b[Bb]ased in)\s*([A-Z][A-Za-z .'-]{2,30}(?:,\s*[A-Z][A-Za-z .'-]{2,30})?)/.exec(text)?.[1]?.trim();
  if (hq) { f.hq = hq; const [city, country] = hq.split(",").map((x) => x.trim()); if (city) f.city = city; if (country) f.country = country; }
  const stage = /\b(pre-?seed|seed|series\s?[a-d]\+?)\s+(?:round|stage|funding)\b/i.exec(text) ?? /\b(?:stage|round)\s*[:\-–]\s*(pre-?seed|seed|series\s?[a-d]\+?)/i.exec(text);
  if (stage) { const s = stageOf(stage[1]); if (s) f.stage = s; }

  for (const [key, re] of [["marketTam", /\bTAM\b|Total Addressable Market/i], ["marketSam", /\bSAM\b|Serviceable Addressable Market/i], ["marketSom", /\bSOM\b|Serviceable Obtainable Market/i]] as const) {
    const line = lines.find((l) => re.test(l) && /\d/.test(l));
    const val = line && /((?:US\$|USD|SAR|SR|\$|€)?\s?\d[\d.,]*\s?(?:trillion|billion|million|thousand|bn|mn|[BMKT])\b(?:\s?(?:USD|SAR))?)/i.exec(line)?.[1];
    if (line && val) { f[key] = clean(val); ev(key, line); }
  }

  /* ---- team: "Name — Title" or "Name, Title" lines ---- */
  const team: { name: string; title: string; isFounder: boolean }[] = [];
  for (const l of lines) {
    const m = /^(?:[-•*]\s*)?((?:Dr\.?|Prof\.?|Eng\.?)\s+)?([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3})\s*(?:—|–|\||,|:|\(|\s-\s)\s*(.{2,70})$/u.exec(l);
    if (!m) continue;
    const title = m[3].replace(/\)$/, "").trim();
    if (!TITLE.test(title) || /\d/.test(m[2])) continue;
    const nm = `${m[1] ?? ""}${m[2]}`.trim();
    if (!team.some((t) => t.name.toLowerCase() === nm.toLowerCase()) && team.length < 12) team.push({ name: nm, title, isFounder: /founder/i.test(title) });
  }
  if (team.length) f.founders = team;

  /* ---- funding ---- */
  const raised = /\b(?:raised|secured|closed)\s+(?:a\s+total\s+of\s+)?(US\$|USD|\$|SAR|SR)\s?(\d[\d.,]*)\s?(million|billion|thousand|mn|bn|m|b|k)?\b(?:\s+(pre-?seed|seed|series\s?[a-d]\+?)\b)?(?:[^.\n]*?\bled by\s+([^.\n;,]+))?/i.exec(text);
  if (raised) {
    const currency = /^(SAR|SR)$/i.test(raised[1]) ? "SAR" : "USD";
    const amount = amountOf(raised[2], raised[3]);
    const round = raised[4] ? stageOf(raised[4]) : undefined;
    if (amount >= 1e4) {
      f.rounds = [{ ...(round ? { round } : {}), amount, currency, ...(raised[5] ? { lead: raised[5].trim() } : {}) }];
      ev("rounds", raised[0]);
      if (/(to date|so far|in total|total funding|total raised|raised a total)/i.test(text.slice(Math.max(0, raised.index - 60), raised.index + raised[0].length + 60))) { f.fundingTotal = { amount, currency }; ev("fundingTotal", raised[0]); }
    }
  }
  const seeking = /\b(?:seeking|raising|looking to raise|target(?:ing)? (?:a )?raise(?: of)?)\s+((?:US\$|USD|\$|SAR|SR)\s?\d[^\n.;]{0,50})/i.exec(text);
  if (seeking) { f.fundraising = true; f.targetRaise = clean(seeking[1]); ev("targetRaise", seeking[0]); }

  /* ---- regulatory / patents, only as the deck states them ---- */
  const reg = (key: "sfda" | "fda" | "ce", label: string, approved: RegExp) => {
    const m = new RegExp(`(?<![A-Za-z])${label}\\s*[:\\-–]\\s*(Approved|In Progress|Not Submitted|N/A)`, "i").exec(text);
    if (m) { f[key] = m[1].replace(/\b\w/g, (c) => c.toUpperCase()).replace("N/a", "N/A"); ev(key, m[0]); return; }
    const a = approved.exec(text);
    if (a) { f[key] = "Approved"; ev(key, a[0]); }
  };
  reg("sfda", "SFDA", /\bSFDA[- ](?:approved|registered|cleared|licensed)\b|\b(?:approved|registered|licensed) by (?:the )?SFDA\b/i);
  reg("fda", "FDA", /(?<![A-Za-z])FDA[- ](?:approved|cleared)\b|\b(?:approved|cleared) by (?:the )?(?:US )?FDA\b|\b510\(k\) cleared\b/i);
  reg("ce", "CE Mark", /\bCE[- ]?mark(?:ed)?\b[^.\n]{0,25}\b(?:obtained|certified|granted|approved)\b|\b(?:obtained|received|achieved)\b[^.\n]{0,25}\bCE[- ]?mark\b/i);
  const patent = lines.find((l) => /patent/i.test(l) && /(filed|granted|pending|issued|registered)/i.test(l) && l.length <= 150);
  if (patent) { f.patentStatus = patent; ev("patentStatus", patent); }
  const clinical = labelled(/clinical(?: status| validation)?/);
  if (clinical && clinical.length <= 150) { f.clinicalStatus = clinical; ev("clinicalStatus", `Clinical: ${clinical}`); }

  /* ---- labelled narrative lines only ---- */
  const problem = labelled(/problem/); if (problem) f.problem = problem.slice(0, 1000);
  const solution = labelled(/solution/); if (solution) f.solution = solution.slice(0, 1000);
  const tagline = labelled(/tagline/); if (tagline) f.tagline = tagline.slice(0, 150);
  const competitors = labelled(/competitors?|competition/); if (competitors) f.marketCompetitors = competitors.split(/\s*,\s*|\s+vs\.?\s+/).filter((c) => c.length >= 2 && c.length <= 40).slice(0, 10);

  /* ---- category, only when the vocabulary is clearly one sector ---- */
  const scores = Object.entries(CATEGORY_WORDS).map(([cat, re]) => [cat, (text.match(re) ?? []).length] as const).sort((a, b) => b[1] - a[1]);
  if (scores[0][1] >= 3 && scores[0][1] >= 2 * (scores[1]?.[1] ?? 0)) f.category = scores[0][0];

  return { fields: f, evidence };
}
