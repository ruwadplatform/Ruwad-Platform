import { BadRequestException } from "@nestjs/common";
import { newReference, parseApplication } from "./advisory-applications.service";

const valid = () => ({
  name: "Dr. Layla Test", email: "layla@example.com", phone: "+966 55 123 4567", designation: "Professor of Cardiology", institution: "King Test University",
  location: "Riyadh, Saudi Arabia", specialization: "Cardiology", specializations: ["Heart failure"], yearsExperience: 14,
  about: "Fourteen years of clinical practice and research in cardiology, advising device and digital health teams on clinical validation.",
  researchAreas: ["Heart failure"], consultationServices: "Clinical validation reviews", preferredMinutes: 45,
  linkedinUrl: "https://www.linkedin.com/in/layla-test", websiteUrl: "https://scholar.google.com/citations?user=abc", declaration: true,
});

async function messages(over: Record<string, unknown>): Promise<string[]> {
  try { await parseApplication({ ...valid(), ...over }); return []; } catch (e) {
    if (e instanceof BadRequestException) { const m = (e.getResponse() as { message: string | string[] }).message; return Array.isArray(m) ? m : [m]; }
    throw e;
  }
}

describe("application form validation", () => {
  it("accepts a complete application, given as an object or as the JSON text the browser sends", async () => {
    await expect(parseApplication(valid())).resolves.toMatchObject({ name: "Dr. Layla Test", yearsExperience: 14 });
    await expect(parseApplication(JSON.stringify(valid()))).resolves.toMatchObject({ preferredMinutes: 45 });
  });

  it("needs every required field", async () => {
    for (const field of ["name", "email", "phone", "designation", "institution", "location", "specialization", "yearsExperience", "about", "declaration"]) {
      const body: Record<string, unknown> = valid();
      delete body[field];
      expect((await parseApplication(body).then(() => [], (e) => [e])).length).toBe(1);
    }
  });

  it("the optional fields really are optional, and blank optional boxes are treated as empty", async () => {
    const body = valid() as Record<string, unknown>;
    for (const f of ["specializations", "researchAreas", "consultationServices", "preferredMinutes", "linkedinUrl", "websiteUrl"]) delete body[f];
    await expect(parseApplication(body)).resolves.toBeDefined();
    await expect(parseApplication({ ...body, linkedinUrl: "", websiteUrl: "  ", consultationServices: "" })).resolves.toBeDefined();
  });

  it("checks email addresses", async () => {
    for (const bad of ["", "layla", "layla@", "@example.com", "layla@example", "a b@example.com"]) expect((await messages({ email: bad })).length).toBeGreaterThan(0);
  });

  it("checks phone numbers", async () => {
    expect(await messages({ phone: "+966 55 123 4567" })).toEqual([]);
    expect(await messages({ phone: "0551234567" })).toEqual([]);
    expect(await messages({ phone: "(011) 555-0199" })).toEqual([]);
    for (const bad of ["abc", "12345", "+966-55-1", "phone: 0551234567", "<script>1234567</script>"]) expect((await messages({ phone: bad })).length).toBeGreaterThan(0);
  });

  it("limits the consultation length to 30, 45 or 60 minutes", async () => {
    for (const ok of [30, 45, 60]) expect(await messages({ preferredMinutes: ok })).toEqual([]);
    for (const bad of [15, 40, 90, 0, -30]) expect((await messages({ preferredMinutes: bad })).length).toBeGreaterThan(0);
  });

  it("checks years of experience and the length of the biography", async () => {
    expect((await messages({ yearsExperience: -1 })).length).toBeGreaterThan(0);
    expect((await messages({ yearsExperience: 71 })).length).toBeGreaterThan(0);
    expect((await messages({ yearsExperience: 3.5 })).length).toBeGreaterThan(0);
    expect((await messages({ about: "Too short." })).length).toBeGreaterThan(0);
    expect((await messages({ about: "x".repeat(3001) })).length).toBeGreaterThan(0);
  });

  it("accepts only web addresses, and LinkedIn only on linkedin.com", async () => {
    expect((await messages({ linkedinUrl: "https://evil.example.com/linkedin.com" })).length).toBeGreaterThan(0);
    expect((await messages({ linkedinUrl: "linkedin.com/in/me" })).length).toBeGreaterThan(0);
    expect((await messages({ websiteUrl: "javascript:alert(1)" })).length).toBeGreaterThan(0);
    expect((await messages({ websiteUrl: "not a url" })).length).toBeGreaterThan(0);
    expect(await messages({ linkedinUrl: "https://linkedin.com/in/me", websiteUrl: "http://example.org/me" })).toEqual([]);
  });

  it("the declaration must be exactly true", async () => {
    for (const bad of [false, "true", 1, null, undefined]) expect((await messages({ declaration: bad })).length).toBeGreaterThan(0);
  });

  it("rejects fields it does not know about, so nobody can set their own status", async () => {
    expect((await messages({ status: "APPROVED" })).join(" ")).toMatch(/status/);
    expect((await messages({ applicationReference: "ADV-2026-AAAAAA" })).length).toBeGreaterThan(0);
  });

  it("refuses unreadable input", async () => {
    await expect(parseApplication("{not json")).rejects.toBeInstanceOf(BadRequestException);
    await expect(parseApplication(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(parseApplication([])).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("application reference", () => {
  it("looks like ADV-2026-XXXXXX and never contains look-alike characters", () => {
    const ref = newReference(new Date("2026-11-02T10:00:00Z"));
    expect(ref).toMatch(/^ADV-2026-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    for (let i = 0; i < 200; i++) expect(newReference().slice(-6)).not.toMatch(/[01OIL]/);
  });
  it("is drawn from the supplied randomness", () => {
    expect(newReference(new Date("2026-01-01T00:00:00Z"), () => 0)).toBe("ADV-2026-AAAAAA");
  });
});
