import { MlTrainingDataService } from "../ml-training-data.service";

/** Test helper: a real MlTrainingDataService over in-memory fake repositories,
 * so the specs exercise the production labelling/eligibility path rather than
 * a mock of it. */
export function fakeRepo<T>(rows: T[] = []) {
  return { rows, find: jest.fn(async () => rows) };
}

export function trainingService(opts: { snapshots?: any[]; events?: any[]; coverage?: any[]; applicability?: any[] } = {}): MlTrainingDataService {
  return new MlTrainingDataService(
    fakeRepo(opts.snapshots ?? []) as any,
    fakeRepo(opts.events ?? []) as any,
    fakeRepo(opts.coverage ?? []) as any,
    fakeRepo(opts.applicability ?? []) as any,
  );
}

let idSeq = 0;
function whereMatches(row: any, where: any): boolean {
  if (!where) return true;
  const clauses = Array.isArray(where) ? where : [where];
  return clauses.some((w: any) => Object.entries(w).every(([k, v]) => row[k] === v));
}

/** A tiny in-memory TypeORM-repository stand-in: find/findOne/exists/save/create/update/delete with equality `where`. */
export function memoryRepo<T extends Record<string, any> = Record<string, any>>(seed: T[] = []) {
  const rows: T[] = seed.map((r) => ({ id: `seed-${++idSeq}`, createdAt: new Date("2026-10-01T00:00:00Z"), ...r }));
  return {
    rows,
    find: jest.fn(async (opts?: any) => rows.filter((r) => whereMatches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => whereMatches(r, opts?.where)) ?? null),
    exists: jest.fn(async (opts: any) => rows.some((r) => whereMatches(r, opts?.where))),
    create: jest.fn((x: any) => ({ id: `new-${++idSeq}`, createdAt: new Date("2026-10-02T00:00:00Z"), ...x })),
    save: jest.fn(async (x: any) => { const i = rows.findIndex((r) => r.id === x.id); if (i >= 0) rows[i] = x; else rows.push(x); return x; }),
    update: jest.fn(async (where: any, patch: any) => { rows.filter((r) => whereMatches(r, where)).forEach((r) => Object.assign(r, patch)); }),
    delete: jest.fn(async (where: any) => { for (let i = rows.length - 1; i >= 0; i--) if (whereMatches(rows[i], where)) rows.splice(i, 1); }),
  };
}
