import { useEffect, useState } from "react";

export interface ValidationReasonDialogProps {
  open: boolean;
  mode: "validate" | "unvalidate";
  /** What the dialog asks the reviewer for. Validates ≥5 chars before submit. */
  onSubmit: (reason: string, notes: string | undefined) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Reason-required dialog for the validate ↔ unvalidate lifecycle.
 *
 * Both transitions must carry a human-readable reason that lands in
 * extraction_validation_audit. SP-side enforcement: ≥5 chars after trim.
 * Mirroring it here prevents the user from getting an SP error round-trip.
 */
export default function ValidationReasonDialog({
  open,
  mode,
  onSubmit,
  onClose,
}: ValidationReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setNotes("");
      setSubmitting(false);
      setError(null);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const isValidate = mode === "validate";
  const title      = isValidate ? "Validate extraction" : "Unvalidate (reopen for editing)";
  const cta        = isValidate ? "Validate" : "Unvalidate";
  const ctaClass   = isValidate
    ? "px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
    : "px-4 py-2 border border-[#b03a3a] rounded-lg bg-[#b03a3a] text-white font-extrabold hover:opacity-90 disabled:opacity-50";

  async function handleConfirm() {
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Please give a brief reason (at least 5 characters) for the audit log.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(trimmed, notes.trim() || undefined);
    } catch (exc: any) {
      setError(exc?.response?.data?.detail || exc?.message || "Submission failed.");
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
          <h3 className="text-lg font-bold m-0">{title}</h3>
          <p className="text-muted text-xs mt-1 m-0">
            {isValidate
              ? "All field edits will be locked after this. Reviewers can unvalidate later if a correction is needed."
              : "Locks are released and the extraction becomes editable again. Both transitions are recorded in the audit log."}
          </p>
        </div>

        <div className="px-5 py-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">
              Reason (required, audit trail)
            </span>
            <textarea
              className="form-field w-full min-h-[72px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isValidate
                  ? "e.g. all fields cross-checked with transcript and client confirmation"
                  : "e.g. typo in field 73 — need to fix before downstream reports"
              }
              disabled={submitting}
              required
              autoFocus
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">
              Notes (optional)
            </span>
            <textarea
              className="form-field w-full min-h-[56px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any extra context — not shown on the public banner."
              disabled={submitting}
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
            className={ctaClass}
          >
            {submitting ? "Saving…" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}
