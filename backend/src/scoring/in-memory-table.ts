/** A tiny in-memory stand-in for a TypeORM repository (equality `where`, one-column `order`), used ONLY by the backfill's dry run: the real
 * ScoringService, derivation service and engines run over copies of the rows, so a dry run exercises the exact production code path and can
 * physically not write to the database. */
type Row = Record<string, any>;

export class InMemoryTable {
  rows: Row[];
  private n = 0;

  constructor(rows: Row[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  /** Equality, plus TypeORM's In([...]) operator (a FindOperator with type "in"). */
  private matchValue(actual: unknown, expected: any): boolean {
    if (expected && typeof expected === "object" && expected.type === "in" && Array.isArray(expected.value)) return expected.value.includes(actual);
    return actual === expected;
  }

  private match(row: Row, where: any): boolean {
    return !where || (Array.isArray(where) ? where : [where]).some((w: Row) => Object.entries(w).every(([k, v]) => this.matchValue(row[k], v)));
  }

  private order(list: Row[], order: any): Row[] {
    const [key, dir] = Object.entries(order ?? {})[0] ?? [];
    if (!key) return list;
    const sign = String(dir).toUpperCase() === "DESC" ? -1 : 1;
    return [...list].sort((a, b) => (+new Date(a[key]) - +new Date(b[key])) * sign);
  }

  create = (x: Row): Row => ({ id: `mem-${++this.n}`, ...x });

  save = async (x: Row | Row[]): Promise<Row | Row[]> => {
    for (const row of Array.isArray(x) ? x : [x]) {
      if (!row.id) row.id = `mem-${++this.n}`;
      const i = this.rows.findIndex((r) => r.id === row.id);
      if (i >= 0) this.rows[i] = row; else this.rows.push(row);
    }
    return x;
  };

  find = async (o?: { where?: any; order?: any }): Promise<Row[]> => this.order(this.rows.filter((r) => this.match(r, o?.where)), o?.order);
  count = async (o?: { where?: any }): Promise<number> => this.rows.filter((r) => this.match(r, o?.where)).length;
  findOne = async (o: { where?: any; order?: any }): Promise<Row | null> => (await this.find(o))[0] ?? null;

  /** `criteria` is an id or a where-object (including In([...])), like Repository.update. */
  update = async (criteria: string | Row, patch: Row): Promise<void> => {
    for (const r of this.rows) if (typeof criteria === "string" ? r.id === criteria : this.match(r, criteria)) Object.assign(r, patch);
  };
}
