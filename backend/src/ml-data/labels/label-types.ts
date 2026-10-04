import { LabelStatus } from "../../common/enums";

/** Every label calculator's output shape — `status` MUST be checked before
 * `valueBoolean`/`valueNumeric` are read. A NOT_MATURED or
 * INSUFFICIENT_DATA result never carries a value; treating an absent value
 * as `false` is exactly the bug this type exists to prevent. */
export interface LabelResult {
  status: LabelStatus;
  valueBoolean?: boolean;
  valueNumeric?: number;
}

export const NOT_MATURED: LabelResult = { status: LabelStatus.NOT_MATURED };
export const INSUFFICIENT_DATA: LabelResult = { status: LabelStatus.INSUFFICIENT_DATA };
/** Matured, no qualifying event on file, but the outcome family was never
 * attested as checked through the window's end — so this is NOT a negative. */
export const COVERAGE_UNATTESTED: LabelResult = { status: LabelStatus.COVERAGE_UNATTESTED };
