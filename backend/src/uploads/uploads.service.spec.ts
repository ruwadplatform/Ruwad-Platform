import { BadRequestException } from "@nestjs/common";
import { MAX_LOGO_BYTES, UploadsService } from "./uploads.service";

function service() {
  const rows: any[] = [];
  const repo: any = { create: (x: any) => ({ id: `img-${rows.length + 1}`, ...x }), save: async (x: any) => { rows.push(x); return x; } };
  return { svc: new UploadsService(repo), rows };
}
const png = (size: number) => ({ mimetype: "image/png", size, buffer: Buffer.alloc(8) } as unknown as Express.Multer.File);

describe("UploadsService logo size limit", () => {
  it("is 10MB", () => { expect(MAX_LOGO_BYTES).toBe(10 * 1024 * 1024); });
  it("accepts a 3MB logo, which the old 2MB limit would have refused", async () => {
    const { svc, rows } = service();
    await expect(svc.saveLogo(png(3 * 1024 * 1024), "u1")).resolves.toEqual({ id: "img-1" });
    expect(rows).toHaveLength(1);
  });
  it("accepts a logo of exactly 10MB", async () => {
    const { svc } = service();
    await expect(svc.saveLogo(png(MAX_LOGO_BYTES), "u1")).resolves.toBeDefined();
  });
  it("refuses a logo over 10MB with a clear message", async () => {
    const { svc, rows } = service();
    await expect(svc.saveLogo(png(MAX_LOGO_BYTES + 1), "u1")).rejects.toThrow(new BadRequestException("Logo must be 10MB or smaller"));
    expect(rows).toHaveLength(0);
  });
  it("profile photos keep their own, smaller 2MB limit", async () => {
    const { svc } = service();
    await expect(svc.saveAvatar({ ...png(3 * 1024 * 1024), buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) } as any, "u1")).rejects.toThrow("2 MB or smaller");
  });
});
