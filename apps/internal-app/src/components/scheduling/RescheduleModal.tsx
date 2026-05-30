import { useState } from "react";

interface Props {
  record: any;                                            // the table-row shape produced by meetingRecordToRow
  onSubmit: (payload: {
    new_start_time: string;
    new_end_time: string;
    reason?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export default function RescheduleModal({ record, onSubmit, onClose }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMin, setDurationMin] = useState<number>(record?.duration || 60);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!date || !time) {
      setError("Pick a date and time.");
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    if (start.getTime() <= Date.now()) {
      setError("New time must be in the future.");
      return;
    }
    const end = new Date(start.getTime() + durationMin * 60_000);

    setSubmitting(true);
    try {
      await onSubmit({
        new_start_time: start.toISOString(),
        new_end_time:   end.toISOString(),
        reason:         reason.trim() || undefined,
      });
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to reschedule.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-line">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h3 className="text-lg font-bold">Reschedule meeting</h3>
            <p className="text-muted text-xs mt-1 m-0">
              {record?.title || "Untitled"} · {record?.advisor || ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted text-lg leading-none px-2 py-1 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 p-5">
          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">New date</span>
            <input
              className="form-field w-full min-h-[40px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              type="date"
              min={todayIso}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">New start time</span>
            <input
              className="form-field w-full min-h-[40px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">Duration (minutes)</span>
            <select
              className="form-field w-full min-h-[40px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              value={durationMin}
              onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-extrabold text-muted uppercase">Reason (optional)</span>
            <textarea
              className="form-field w-full min-h-[72px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. client requested a later slot"
            />
          </label>

          {error && (
            <div className="px-3 py-2 border border-[rgba(202,78,78,0.35)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-sm">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Rescheduling…" : "Reschedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
