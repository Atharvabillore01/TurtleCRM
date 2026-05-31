import { useEffect, useState } from "react";
import {
  fetchValidationHistory,
  ValidationAuditEntry,
} from "../../api/meetingApi";

export interface ValidationHistoryBannerProps {
  /** Refresh whenever this changes. Set via `refreshKey` from the parent to
   * force a re-fetch after validate/unvalidate completes. */
  extractionId: string;
  refreshKey?: number;
}

/**
 * Compact history strip rendered above the attribute table on the AI
 * Validation detail view. Shows the most-recent N validate/unvalidate
 * events with who, when, and the reviewer-supplied reason.
 *
 * Pulls from /api/extractions/{id}/validation-history. Hides itself when
 * the history is empty (a brand-new extraction with no transitions yet).
 */
export default function ValidationHistoryBanner({
  extractionId,
  refreshKey = 0,
}: ValidationHistoryBannerProps) {
  const [entries, setEntries] = useState<ValidationAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!extractionId) return;
    let cancelled = false;
    setLoading(true);
    fetchValidationHistory(extractionId, 10)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        // Soft-fail: banner just doesn't render anything on transient error.
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [extractionId, refreshKey]);

  if (loading && entries.length === 0) return null;

  const latest    = entries[0];
  if (!latest) return null;            // narrows `latest` to ValidationAuditEntry
  const remaining = entries.slice(1);
  const shown     = expanded ? remaining : remaining.slice(0, 2);

  return (
    <section
      className="mb-3 p-3 border border-line rounded-lg bg-[rgba(250,253,252,0.95)]"
      aria-label="Validation history"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-black uppercase tracking-wider text-muted">
            Latest validation event
          </p>
          <p className="m-0 text-sm">
            <strong>
              {latest.action === "validated" ? "✓ Validated" : "↺ Unvalidated"}
            </strong>{" "}
            <span className="text-muted">by</span>{" "}
            <strong>{latest.performed_by_name || "—"}</strong>{" "}
            <span className="text-muted">·</span>{" "}
            <span>{formatTimeAgo(latest.performed_at)}</span>
          </p>
          <p className="m-0 text-xs text-muted mt-0.5 truncate" title={latest.reason}>
            “{latest.reason}”
          </p>
        </div>
        {remaining.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[11px] font-black uppercase tracking-wider text-[#137765] hover:underline"
          >
            {expanded ? "Hide" : `+${remaining.length} earlier`}
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <ul className="grid gap-1.5 mt-3 pl-3 border-l-2 border-line">
          {shown.map((e) => (
            <li key={e.id} className="text-[11px] text-muted">
              <strong>
                {e.action === "validated" ? "✓ Validated" : "↺ Unvalidated"}
              </strong>{" "}
              by <strong>{e.performed_by_name || "—"}</strong>{" · "}
              {formatTimeAgo(e.performed_at)} —{" "}
              <span className="text-ink" title={e.reason}>“{truncate(e.reason, 80)}”</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso || "—";
  const diff = Date.now() - then;
  const min  = Math.floor(diff / 60_000);
  if (min < 1)         return "just now";
  if (min < 60)        return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24)        return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14)       return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
