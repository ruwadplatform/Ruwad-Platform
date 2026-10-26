import { checkApplicationFiles, checkFile, MAX_TOTAL_APPLICATION_BYTES } from "./advisory-application-files";

const pdf = (extra = 0) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(extra, 0x20)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const file = (originalname: string, buffer: Buffer) => ({ originalname, size: buffer.length, buffer });

describe("application documents", () => {
  it("accepts a PDF CV and stores it under its real type", () => {
    const r = checkFile("CV", file("My CV.pdf", pdf()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file).toMatchObject({ kind: "CV", fileName: "My CV.pdf", mimeType: "application/pdf" });
  });

  it("refuses a CV that is not a PDF, whatever it is called", () => {
    expect(checkFile("CV", file("cv.docx", pdf())).ok).toBe(false);
    expect(checkFile("CV", file("cv.png", png)).ok).toBe(false);
    const renamed = checkFile("CV", file("cv.pdf", Buffer.from("MZ\u0090 this is really a program")));
    expect(renamed.ok).toBe(false);
    if (!renamed.ok) expect(renamed.error).toMatch(/isn't a valid PDF/);
  });

  it("refuses an empty file and one over its size limit", () => {
    expect(checkFile("CV", { originalname: "cv.pdf", size: 0, buffer: Buffer.alloc(0) }).ok).toBe(false);
    const big = checkFile("CV", { originalname: "cv.pdf", size: 5 * 1024 * 1024 + 1, buffer: pdf() });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/larger than 5 MB/);
    const photo = checkFile("PHOTO", { originalname: "me.jpg", size: 2 * 1024 * 1024 + 1, buffer: jpg });
    expect(photo.ok).toBe(false);
    if (!photo.ok) expect(photo.error).toMatch(/larger than 2 MB/);
  });

  it("takes PNG or JPG for the photograph and PDF or images for certificates, nothing executable", () => {
    expect(checkFile("PHOTO", file("me.png", png)).ok).toBe(true);
    expect(checkFile("PHOTO", file("me.jpeg", jpg)).ok).toBe(true);
    expect(checkFile("PHOTO", file("me.pdf", pdf())).ok).toBe(false);
    expect(checkFile("CERTIFICATE", file("board.pdf", pdf())).ok).toBe(true);
    expect(checkFile("CERTIFICATE", file("board.jpg", jpg)).ok).toBe(true);
    for (const bad of ["run.exe", "page.html", "image.svg", "script.js", "archive.zip"]) expect(checkFile("CERTIFICATE", file(bad, pdf())).ok).toBe(false);
  });

  it("keeps only a harmless file name (no folders, quotes or control characters)", () => {
    const r = checkFile("CV", file("..\\..\\evil\"name\u0001.pdf", pdf()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.fileName).toBe("evilname.pdf");
  });

  it("requires the CV, and reports every problem at once", () => {
    const none = checkApplicationFiles({});
    expect(none.errors).toEqual(["Attach your CV or resume as a PDF."]);
    const many = checkApplicationFiles({ cv: [file("cv.txt", pdf())], photo: [file("me.gif", png)] });
    expect(many.errors).toHaveLength(2);
    expect(many.files).toHaveLength(0);
  });

  it("limits how many files, and how much altogether", () => {
    const six = Array.from({ length: 6 }, (_, i) => file(`c${i}.pdf`, pdf()));
    expect(checkApplicationFiles({ cv: [file("cv.pdf", pdf())], certificates: six }).errors.join(" ")).toMatch(/at most 5/);
    expect(checkApplicationFiles({ cv: [file("a.pdf", pdf()), file("b.pdf", pdf())] }).errors.join(" ")).toMatch(/at most 1/);
    const heavy = Array.from({ length: 5 }, (_, i) => ({ originalname: `h${i}.pdf`, size: 4.9 * 1024 * 1024, buffer: pdf() }));
    const r = checkApplicationFiles({ cv: [{ originalname: "cv.pdf", size: 4.9 * 1024 * 1024, buffer: pdf() }], certificates: heavy });
    expect(r.errors.join(" ")).toContain(`${MAX_TOTAL_APPLICATION_BYTES / 1024 / 1024} MB`);
  });

  it("a complete, valid set passes with the CV required and the rest optional", () => {
    const r = checkApplicationFiles({ cv: [file("cv.pdf", pdf())] });
    expect(r.errors).toEqual([]);
    expect(r.files.map((f) => f.kind)).toEqual(["CV"]);
    const full = checkApplicationFiles({ cv: [file("cv.pdf", pdf())], certificates: [file("c.pdf", pdf()), file("d.png", png)], photo: [file("me.jpg", jpg)] });
    expect(full.errors).toEqual([]);
    expect(full.files.map((f) => f.kind)).toEqual(["CV", "CERTIFICATE", "CERTIFICATE", "PHOTO"]);
  });
});
