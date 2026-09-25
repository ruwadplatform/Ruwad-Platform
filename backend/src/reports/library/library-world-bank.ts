import { fetchDocument, type DocumentFetch } from "../../content/safe-fetch";
import type { WorldBankPoint } from "./library-types";

interface Indicator { id: string; code: string; label: string; unit: string; decimals: number; thousands?: boolean }

/** Saudi Arabia indicators the library reports may use. Values are never stored in code: they are read from the World Bank API
 * at generation time, together with the year they refer to. */
export const WORLD_BANK_INDICATORS: Indicator[] = [
  { id: "wb-health-exp-gdp", code: "SH.XPD.CHEX.GD.ZS", label: "Current health expenditure", unit: "% of GDP", decimals: 1 },
  { id: "wb-health-exp-pc", code: "SH.XPD.CHEX.PC.CD", label: "Current health expenditure per capita", unit: "current US$", decimals: 0, thousands: true },
  { id: "wb-physicians", code: "SH.MED.PHYS.ZS", label: "Physicians", unit: "per 1,000 people", decimals: 1 },
  { id: "wb-nurses", code: "SH.MED.NUMW.P3", label: "Nurses and midwives", unit: "per 1,000 people", decimals: 1 },
  { id: "wb-beds", code: "SH.MED.BEDS.ZS", label: "Hospital beds", unit: "per 1,000 people", decimals: 1 },
  { id: "wb-population", code: "SP.POP.TOTL", label: "Population, total", unit: "people", decimals: 0, thousands: true },
  { id: "wb-life-expectancy", code: "SP.DYN.LE00.IN", label: "Life expectancy at birth", unit: "years", decimals: 1 },
  { id: "wb-rd", code: "GB.XPD.RSDV.GD.ZS", label: "Research and development expenditure", unit: "% of GDP", decimals: 2 },
];

export const WORLD_BANK_BY_ID = new Map(WORLD_BANK_INDICATORS.map((i) => [i.id, i]));

const format = (v: number, i: Indicator) => (i.thousands ? Math.round(v).toLocaleString("en-US") : v.toFixed(i.decimals));

/** Latest non-empty value of each requested indicator for Saudi Arabia. An indicator the API can't return is simply left out. */
export async function fetchWorldBank(ids: string[], fetcher: (url: string) => Promise<DocumentFetch> = fetchDocument, now = new Date()): Promise<{ points: WorldBankPoint[]; failed: string[] }> {
  const points: WorldBankPoint[] = [];
  const failed: string[] = [];
  await Promise.all(ids.map(async (id) => {
    const ind = WORLD_BANK_BY_ID.get(id);
    if (!ind) return;
    try {
      const doc = await fetcher(`https://api.worldbank.org/v2/country/SAU/indicator/${ind.code}?format=json&per_page=5&mrnev=1`);
      if (!doc.ok) throw new Error("unreachable");
      const row = (JSON.parse(doc.body.toString("utf8")) as [unknown, { value: number | null; date: string; country?: { value?: string } }[]])[1]?.find((r) => typeof r.value === "number");
      if (!row || typeof row.value !== "number") throw new Error("no value");
      points.push({
        id: ind.id, code: ind.code, label: ind.label, unit: ind.unit, value: row.value, display: format(row.value, ind), year: Number(row.date),
        geography: row.country?.value ?? "Saudi Arabia", organization: "World Bank", url: `https://data.worldbank.org/indicator/${ind.code}?locations=SA`, retrievedAt: now.toISOString(),
      });
    } catch { failed.push(id); }
  }));
  points.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { points, failed };
}
