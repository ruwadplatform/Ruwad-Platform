import assert from "node:assert/strict";
import { test } from "node:test";
import { DURATIONS, EMPTY_APPLICATION, FIELD_ORDER, checkFile, splitList, toPayload, validateApplication, type ApplicationValues } from "./application-form.ts";

const valid = (): ApplicationValues => ({
  ...EMPTY_APPLICATION, name: "Dr. Layla Test", email: "layla@example.com", phone: "+966 55 123 4567", designation: "Professor", institution: "King Test University",
  location: "Riyadh, Saudi Arabia", specialization: "Cardiology", yearsExperience: "14", about: "Fourteen years of clinical practice and research in cardiology, advising teams.",
  declaration: true,
});
const files = { cv: { name: "cv.pdf", size: 1000 }, certificates: [], photo: null };

test("a complete application has no errors, and optional fields can stay blank", () => {
  assert.deepEqual(validateApplication(valid(), files), {});
});

test("every required field is reported when empty", () => {
  const errors = validateApplication(EMPTY_APPLICATION, { cv: null, certificates: [], photo: null });
  for (const k of ["name", "email", "phone", "designation", "institution", "location", "specialization", "yearsExperience", "about", "cv", "declaration"] as const) assert.ok(errors[k], k);
  for (const k of ["specializations", "researchAreas", "consultationServices", "preferredMinutes", "linkedinUrl", "websiteUrl", "certificates", "photo"] as const) assert.equal(errors[k], undefined, k);
});

test("email addresses", () => {
  for (const ok of ["a@b.co", "layla.test+x@uni.edu.sa"]) assert.equal(validateApplication({ ...valid(), email: ok }, files).email, undefined, ok);
  for (const bad of ["layla", "layla@", "@x.com", "layla@x", "a b@x.com"]) assert.ok(validateApplication({ ...valid(), email: bad }, files).email, bad);
});

test("phone numbers", () => {
  for (const ok of ["+966 55 123 4567", "0551234567", "(011) 555-0199"]) assert.equal(validateApplication({ ...valid(), phone: ok }, files).phone, undefined, ok);
  for (const bad of ["abc", "12345", "+966-55-1", "tel 0551234567"]) assert.ok(validateApplication({ ...valid(), phone: bad }, files).phone, bad);
});

test("years of experience is a whole number from 0 to 70", () => {
  for (const ok of ["0", "14", "70"]) assert.equal(validateApplication({ ...valid(), yearsExperience: ok }, files).yearsExperience, undefined, ok);
  for (const bad of ["-1", "71", "3.5", "ten", " "]) assert.ok(validateApplication({ ...valid(), yearsExperience: bad }, files).yearsExperience, bad);
});

test("the biography needs at least 50 characters", () => {
  assert.ok(validateApplication({ ...valid(), about: "Too short." }, files).about);
  assert.ok(validateApplication({ ...valid(), about: "x".repeat(3001) }, files).about);
});

test("links: LinkedIn only on linkedin.com, websites must be http(s)", () => {
  assert.equal(validateApplication({ ...valid(), linkedinUrl: "https://www.linkedin.com/in/me", websiteUrl: "https://scholar.google.com/citations?user=1" }, files).linkedinUrl, undefined);
  assert.ok(validateApplication({ ...valid(), linkedinUrl: "https://evil.example/linkedin.com" }, files).linkedinUrl);
  assert.ok(validateApplication({ ...valid(), linkedinUrl: "linkedin.com/in/me" }, files).linkedinUrl);
  assert.ok(validateApplication({ ...valid(), websiteUrl: "javascript:alert(1)" }, files).websiteUrl);
  assert.ok(validateApplication({ ...valid(), websiteUrl: "my site" }, files).websiteUrl);
});

test("preferred duration is 30, 45 or 60", () => {
  for (const d of DURATIONS) assert.equal(validateApplication({ ...valid(), preferredMinutes: String(d) }, files).preferredMinutes, undefined);
  assert.ok(validateApplication({ ...valid(), preferredMinutes: "20" }, files).preferredMinutes);
});

test("the declaration must be ticked", () => {
  assert.ok(validateApplication({ ...valid(), declaration: false }, files).declaration);
});

test("file types and sizes", () => {
  assert.equal(checkFile("cv", { name: "cv.PDF", size: 10 }), null);
  assert.ok(checkFile("cv", { name: "cv.docx", size: 10 }));
  assert.ok(checkFile("cv", { name: "cv.pdf", size: 5 * 1024 * 1024 + 1 }));
  assert.ok(checkFile("cv", { name: "cv.pdf", size: 0 }));
  assert.equal(checkFile("certificate", { name: "c.png", size: 10 }), null);
  assert.ok(checkFile("certificate", { name: "c.exe", size: 10 }));
  assert.equal(checkFile("photo", { name: "me.jpeg", size: 10 }), null);
  assert.ok(checkFile("photo", { name: "me.pdf", size: 10 }));
  assert.ok(checkFile("photo", { name: "me.jpg", size: 2 * 1024 * 1024 + 1 }));
});

test("the form reports file problems against the right field", () => {
  const e = validateApplication(valid(), { cv: { name: "cv.txt", size: 10 }, certificates: [{ name: "a.pdf", size: 10 }, { name: "b.gif", size: 10 }], photo: { name: "me.pdf", size: 10 } });
  assert.ok(e.cv && e.certificates && e.photo);
  const many = validateApplication(valid(), { cv: files.cv, certificates: Array.from({ length: 6 }, (_, i) => ({ name: `c${i}.pdf`, size: 10 })), photo: null });
  assert.match(many.certificates ?? "", /at most 5/);
});

test("the payload trims, splits lists and leaves blank optional fields out", () => {
  const p = toPayload({ ...valid(), name: "  Dr. Layla  ", specializations: "Heart failure, Clinical trials;\nImaging", researchAreas: "", consultationServices: " ", preferredMinutes: "45" });
  assert.equal(p.name, "Dr. Layla");
  assert.deepEqual(p.specializations, ["Heart failure", "Clinical trials", "Imaging"]);
  assert.deepEqual(p.researchAreas, []);
  assert.equal(p.consultationServices, undefined);
  assert.equal(p.preferredMinutes, 45);
  assert.equal(p.yearsExperience, 14);
  assert.equal(p.declaration, true);
  assert.equal(p.linkedinUrl, undefined);
});

test("splitList and the focus order", () => {
  assert.deepEqual(splitList(" a, b ,,c;d\ne "), ["a", "b", "c", "d", "e"]);
  assert.equal(new Set(FIELD_ORDER).size, FIELD_ORDER.length);
  for (const k of Object.keys(EMPTY_APPLICATION)) assert.ok(FIELD_ORDER.includes(k as never), k);
});
