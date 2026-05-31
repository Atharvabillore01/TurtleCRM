import { useEffect, useState } from "react";

export interface RejectFieldModalProps {
  open: boolean;
  attributeLabel: string;
  currentValue: any;
  /** Submit handler. `newValue=null` means "rejected without replacement". */
  onSubmit: (newValue: any | null, reason: string) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Reject-with-replacement dialog.
 *
 * Reviewer flow:
 *   1. AI extracted a value the reviewer disagrees with.
 *   2. Reviewer clicks the ✕ Reject button on the attribute row.
 *   3. THIS modal opens with the AI value pre-filled and asks the reviewer
 *      to either:
 *        a. Type the correct value + reason → submits as a patch with
 *           confidence=1.0, source='reviewer', reason='rejected — replaced'
 *        b. Tick "No correct value available" → submits null + reason
 *           ('rejected — no data') as a patch.
 *   4. Either way, sp_patch_extraction_fields writes an audit row.
 *
 * The reason field is required (min 5 chars) so the audit trail is meaningful.
 */
export default function RejectFieldModal({
  open,
  attributeLabel,
  currentValue,
  onSubmit,
  onClose,
}: RejectFieldModalProps) {
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [noReplacement, setNoReplacement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens for a different row.
  useEffect(() => {
    if (open) {
      setNewValue("");
      setReason("");
      setNoReplacement(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open, attributeLabel, currentValue]);

  // ESC closes (unless submitting)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleConfirm() {
    setError(null);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError("Please give a brief reason (at least 5 characters) for the audit log.");
      return;
    }
    if (!noReplacement) {
      const trimmed = newValue.trim();
      if (!trimmed) {
        setError("Enter the correct value, or tick 'No correct value available' below.");
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit(noReplacement ? null : newValue.trim(), trimmedReason);
    } catch (exc: any) {
      setError(exc?.message || "Failed to save rejection.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-lg font-bold m-0">Reject and replace</h3>
          <p className="text-muted text-xs mt-1 m-0">
            <strong>{attributeLabel}</strong>
          </p>
        </div>

        <div className="px-5 py-4 grid gap-3">
          <div className="text-sm">
            <span className="text-muted">AI extracted: </span>
            <strong>
              {currentValue === null || currentValue === ""
                ? "(empty)"
                : String(currentValue)}
            </strong>
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">
              Correct value
            </span>
            <input
              type="text"
              className="form-field w-full min-h-[42px] px-3 py-2 border border-line rounded-lg outline-none bg-white disabled:bg-surface-soft disabled:text-muted"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Type the value that should have been extracted"
              disabled={noReplacement || submitting}
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={noReplacement}
              onChange={(e) => setNoReplacement(e.target.checked)}
              disabled={submitting}
            />
            <span>
              No correct value available — clear this field
            </span>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">
              Reason (audit trail)
            </span>
            <textarea
              className="form-field w-full min-h-[72px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. transcript misheard the number; client said 18 lakhs not 80"
              disabled={submitting}
              required
            />
          </label>

          {error && (
            <div className="px-3 py-2 border border-[rgba(202,78,78,0.35)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 border border-[#b03a3a] rounded-lg bg-[#b03a3a] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Reject and save"}
          </button>
        </div>
      </div>
    </div>
  );
}
