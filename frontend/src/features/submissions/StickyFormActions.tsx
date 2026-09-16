import { RuwadIcon } from "@/components/icons/ruwad-icon";

/** The sticky bottom action bar — extracted verbatim from SubmissionWizard's
 * inline JSX. .form-sticky-actions is already position:sticky;bottom:0, so
 * no CSS changes are needed for this extraction. */
export function StickyFormActions({
  onPrev, prevDisabled, onDeleteDraft, onSaveDraft, isReviewStep, canSubmit, submitting, onNext, onSubmit,
}: {
  onPrev: () => void;
  prevDisabled: boolean;
  onDeleteDraft: () => void;
  onSaveDraft: () => void;
  isReviewStep: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onNext: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="form-sticky-actions">
      <div className="flex gap-8">
        <button type="button" className="btn btn-outline" onClick={onPrev} disabled={prevDisabled}>Previous</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onDeleteDraft}><RuwadIcon name="trash" size={13} /> Delete Draft</button>
      </div>
      <div className="flex gap-8">
        <button type="button" className="btn btn-outline" onClick={onSaveDraft}>Save Draft</button>
        {isReviewStep ? (
          <button type="button" className="btn btn-primary" disabled={!canSubmit || submitting} onClick={onSubmit}>
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onNext}>Next</button>
        )}
      </div>
    </div>
  );
}
