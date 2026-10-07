import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataRoomFilesService, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, safeFileName } from "./data-room-files.service";
import { EntityKind } from "../common/enums";

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 1)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 2)]);
const upload = (name: string, buf: Buffer, size = buf.length) => ({ originalname: name, buffer: buf, size } as Express.Multer.File);

function build(opts: { existing?: { id: string; size: number }[] } = {}) {
  const rows: Record<string, any>[] = [];
  const refs: Record<string, any>[] = [];
  const files: any = {
    find: jest.fn(async (o: any) => (o.select ? (opts.existing ?? rows.map((r) => ({ id: r.id, size: r.size }))) : rows.filter((r) => r.entityId === o.where.entityId))),
    findOne: jest.fn(async (o: any) => rows.find((r) => r.id === o.where.id && r.entityId === o.where.entityId) ?? null),
    count: jest.fn(async (o: any) => rows.filter((r) => r.entityId === o.where.entityId && r.category === o.where.category).length),
    create: jest.fn((x: any) => ({ id: `f${rows.length + 1}`, createdAt: new Date(), ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    delete: jest.fn(async (id: string) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); }),
  };
  const docs: any = {
    findOne: jest.fn(async (o: any) => refs.find((r) => r.name === o.where.name && r.entityId === o.where.entityId) ?? null),
    create: jest.fn((x: any) => ({ id: `d${refs.length + 1}`, ...x })),
    save: jest.fn(async (x: any) => { const i = refs.findIndex((r) => r.id === x.id); if (i >= 0) refs[i] = x; else refs.push(x); return x; }),
  };
  return { svc: new DataRoomFilesService(files, docs), rows, refs };
}
const K = EntityKind.STARTUP;

describe("DataRoomFilesService", () => {
  it("stores a valid document with a server-decided type and marks its checklist item as on file", async () => {
    const t = build();
    const out = await t.svc.upload(K, "s1", "u1", upload("Deck 2026.pdf", PDF), { category: "Pitch Deck" });
    expect(out).toMatchObject({ name: "Deck 2026", category: "Pitch Deck", fileName: "Deck 2026.pdf", mimeType: "application/pdf" });
    expect(t.refs).toEqual([expect.objectContaining({ name: "Pitch Deck", onFile: true })]);
  });

  it("rejects a file whose contents do not match its extension", async () => {
    const t = build();
    await expect(t.svc.upload(K, "s1", "u1", upload("fake.pdf", ZIP), { category: "Other" })).rejects.toThrow(/do not match/);
    await expect(t.svc.upload(K, "s1", "u1", upload("fake.docx", PDF), { category: "Other" })).rejects.toThrow(/do not match/);
    expect(t.rows).toHaveLength(0);
  });

  it("rejects an unsupported type, an empty file and a missing file", async () => {
    const t = build();
    await expect(t.svc.upload(K, "s1", "u1", upload("run.exe", Buffer.from("MZ....")), { category: "Other" })).rejects.toThrow(/Upload a PDF/);
    await expect(t.svc.upload(K, "s1", "u1", upload("a.pdf", Buffer.alloc(0)), { category: "Other" })).rejects.toThrow(/empty/);
    await expect(t.svc.upload(K, "s1", "u1", undefined, { category: "Other" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces the per-file size, the file count and the total size", async () => {
    await expect(build().svc.upload(K, "s1", "u1", upload("big.pdf", PDF, MAX_FILE_BYTES + 1), { category: "Other" })).rejects.toThrow(/MB or smaller/);
    const full = build({ existing: Array.from({ length: MAX_FILES }, (_, i) => ({ id: `x${i}`, size: 10 })) });
    await expect(full.svc.upload(K, "s1", "u1", upload("a.pdf", PDF), { category: "Other" })).rejects.toThrow(/at most/);
    const heavy = build({ existing: [{ id: "x", size: MAX_TOTAL_BYTES - 10 }] });
    await expect(heavy.svc.upload(K, "s1", "u1", upload("a.pdf", PDF), { category: "Other" })).rejects.toThrow(/exceed/);
  });

  it("deleting the last document of a checklist category flips it back to not provided; other categories do not touch the checklist", async () => {
    const t = build();
    const a = await t.svc.upload(K, "s1", "u1", upload("a.pdf", PDF), { category: "Cap Table" });
    const b = await t.svc.upload(K, "s1", "u1", upload("b.pdf", PDF), { category: "Cap Table" });
    await t.svc.upload(K, "s1", "u1", upload("c.pdf", PDF), { category: "Legal" });
    expect(t.refs.map((r) => r.name)).toEqual(["Cap Table"]); // "Legal" is not a checklist item
    await t.svc.remove(K, "s1", a.id);
    expect(t.refs[0].onFile).toBe(true); // one Cap Table document remains
    await t.svc.remove(K, "s1", b.id);
    expect(t.refs[0].onFile).toBe(false);
  });

  it("moving a document between categories updates both checklist items", async () => {
    const t = build();
    const f = await t.svc.upload(K, "s1", "u1", upload("a.pdf", PDF), { category: "Cap Table" });
    await t.svc.update(K, "s1", f.id, { category: "Certifications", name: "ISO cert" });
    expect(t.refs.find((r) => r.name === "Cap Table")!.onFile).toBe(false);
    expect(t.refs.find((r) => r.name === "Certifications")!.onFile).toBe(true);
    expect(t.rows[0].name).toBe("ISO cert");
  });

  it("a file id from another Data Room cannot be reached", async () => {
    const t = build();
    const f = await t.svc.upload(K, "s1", "u1", upload("a.pdf", PDF), { category: "Other" });
    await expect(t.svc.update(K, "someone-else", f.id, { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.svc.remove(K, "someone-else", f.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("safeFileName", () => {
  it("never carries a path or header-breaking characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\deck.pdf")).toBe("deck.pdf");
    expect(safeFileName('a"b\r\nc.pdf')).toBe("abc.pdf");
    expect(safeFileName("")).toBe("document");
  });
});
