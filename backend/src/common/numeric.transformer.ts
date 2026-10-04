import { ValueTransformer } from "typeorm";

/** pg's driver returns Postgres `numeric` columns as strings, not JS
 * numbers, to avoid silent precision loss on values bigger than a JS
 * number can represent exactly — but every consumer in this codebase
 * expects a real number (arithmetic, `Number.isFinite` checks, JSON
 * responses). Apply this transformer on every `numeric`-typed column so
 * the string-vs-number mismatch is fixed once, at the one place it can
 * leak from, rather than requiring every read site to remember to coerce
 * it themselves (a bug already caught twice — see StartupScoreHistory's
 * own manual Number() coercion in scoring.service.ts, and the
 * StartupOutcomeEvent.valueNumeric bug this transformer fixes). */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
