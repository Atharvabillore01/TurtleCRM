import { useEffect } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";   // danger = red confirm button (delete/cancel), primary = green
  busy?: boolean;                   // shows spinner text on confirm + disables both buttons
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Themed confirm dialog. Drop-in replacement for window.confirm().
 *
 * Example:
 *   const [confirmOpen, setConfirmOpen] = useState(false);
 *   <ConfirmDialog
 *     open={confirmOpen}
 *     title="Cancel meeting"
 *     message={`Cancel "${title}"? Attendees will be notified.`}
 *     variant="danger"
 *     confirmLabel="Yes, cancel meeting"
 *     onConfirm={async () => { await doCancel(); setConfirmOpen(false); }}
 *     onClose={() => setConfirmOpen(false)}
 *   />
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  // ESC closes the dialog (unless busy).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "px-4 py-2 border border-[#b03a3a] rounded-lg bg-[#b03a3a] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
      : "px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-lg font-bold m-0">{title}</h3>
        </div>

        <div className="px-5 py-4 text-sm text-ink">
          {message}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={confirmClass}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
