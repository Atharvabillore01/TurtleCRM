import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  previewIngest,
  ingestMeeting,
  newIdempotencyKey,
  IngestPreview,
  IngestResult,
  fetchExtractionForMeeting,
} from "../api/meetingApi";
import { showApiError } from "../utils/showApiError";
import ConfirmDialog from "../components/shared/ConfirmDialog";

const POLL_INTERVAL_MS = 5_000;     // check every 5 seconds
const POLL_TIMEOUT_MS  = 10 * 60_000;  // give up after 10 min (covers 2hr meetings)

/**
 * Manual Fireflies ingest page.
 *
 * Two-step UX:
 *   1. Paste URL → /ingest/preview → render attendee + match diagnostics
 *   2. Confirm    → /ingest         → create meeting + transcript +
 *                                     trigger extraction pipeline
 *
 * Frontend re-uses one idempotency_key per Confirm click so retries are safe.
 */
export default function IngestMeetingPage() {
  const navigate = useNavigate();

  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [confirmReingest, setConfirmReingest] = useState(false);

  // Post-ingest state — drives the "Extraction running..." card
  const [processing, setProcessing] = useState<{
    result: IngestResult;
    startedAt: number;
    ready: boolean;
  } | null>(null);
  const pollTimer = useRef<number | null>(null);

  // Cleanup the polling timer if the user navigates away
  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);


  // Tick once per second to update the "elapsed 12s" display while processing
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (!processing || processing.ready) return;
    const t = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [processing]);

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    setPreview(null);
    if (!url.trim()) return;
    setPreviewing(true);
    try {
      const result = await previewIngest(url.trim());
      setPreview(result);
    } catch (err) {
      showApiError(err, "Could not fetch Fireflies meeting details.");
    } finally {
      setPreviewing(false);
    }
  }

  function handleIngestClick() {
    if (!preview) return;
    // Already-ingested meeting → confirm before re-running
    if (preview.already_ingested_meeting_id) {
      setConfirmReingest(true);
      return;
    }
    void doIngest();
  }

  async function doIngest() {
    if (!preview) return;
    setIngesting(true);
    setConfirmReingest(false);
    try {
      const result = await ingestMeeting(url.trim(), newIdempotencyKey());
      toast.success(
        result.was_replay
          ? "Re-analysis triggered."
          : result.was_new_client
            ? `Ingested. New client ${result.client_name} created.`
            : `Ingested meeting for ${result.client_name}.`,
      );
      // Switch to processing view + start polling for the extraction
      const startedAt = Date.now();
      setProcessing({ result, startedAt, ready: false });
      startPolling(result, startedAt);
    } catch (err) {
      showApiError(err, "Failed to ingest meeting.");
    } finally {
      setIngesting(false);
    }
  }

  function startPolling(result: IngestResult, startedAtOverride?: number) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    const meetingId = result.meeting_id;
    const startedAt = startedAtOverride ?? Date.now();   // captured in closure

    pollTimer.current = window.setInterval(async () => {
      // Stop after timeout
      const elapsed = Date.now() - startedAt;
      if (elapsed > POLL_TIMEOUT_MS) {
        if (pollTimer.current) window.clearInterval(pollTimer.current);
        pollTimer.current = null;
        toast(
          "Extraction is taking longer than usual. You can refresh AI Validation later — we'll keep processing in the background.",
          { icon: "⏱️", duration: 8_000 },
        );
        return;
      }

      try {
        const extraction = await fetchExtractionForMeeting(meetingId);
        if (extraction) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
          setProcessing((p) => (p ? { ...p, ready: true } : p));
          toast.success(
            `Extraction ready for ${result.client_name} — ${extraction.total_fields} fields extracted.`,
            { duration: 6_000 },
          );
        }
      } catch {
        // Swallow transient errors — keep polling
      }
    }, POLL_INTERVAL_MS);
  }

  function resetForNewIngest() {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = null;
    setProcessing(null);
    setPreview(null);
    setUrl("");
  }

  const canIngest =
    !!preview &&
    !preview.would_skip_reason &&
    preview.transcript_ready &&
    !!preview.advisor_match &&
    !!preview.client;

  // ── Post-ingest "Extraction running" view ──────────────────────────────
  if (processing) {
    const elapsedSec = Math.floor((Date.now() - processing.startedAt) / 1000);
    return (
      <div className="max-w-3xl mx-auto p-4">
        <header className="mb-5">
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">
            Ingest from Fireflies
          </p>
          <h1>
            {processing.ready ? "Extraction complete" : "Extraction in progress…"}
          </h1>
        </header>

        <div className="p-5 border border-line rounded-2xl bg-white shadow-card">
          <div className="grid grid-cols-[48px_1fr] items-center gap-3 mb-3">
            {processing.ready ? (
              <span className="grid w-12 h-12 place-items-center rounded-full bg-[#d8fff6] text-2xl">
                ✓
              </span>
            ) : (
              <span className="grid w-12 h-12 place-items-center rounded-full bg-[#fff8e6] text-2xl animate-pulse">
                ⏳
              </span>
            )}
            <div>
              <p className="m-0 text-sm font-extrabold text-ink">
                {processing.result.client_name}
              </p>
              <p className="m-0 text-xs text-muted">
                Advisor: {processing.result.advisor_name}
                {processing.result.was_new_client && " · new client created"}
              </p>
            </div>
          </div>

          {!processing.ready ? (
            <>
              <p className="text-sm text-muted mb-3">
                Meeting + transcript are saved. The 174-field extraction is
                running in the background and typically completes in
                30-90 seconds (longer for 1hr+ meetings).
                We&apos;ll notify you as soon as it&apos;s ready — feel free to
                continue working in another tab.
              </p>
              <div className="flex items-center gap-3 mb-4 text-xs text-muted">
                <span className="inline-block w-2 h-2 rounded-full bg-green animate-pulse" />
                Checking every 5s · elapsed {elapsedSec}s
              </div>
            </>
          ) : (
            <p className="text-sm text-ink mb-4">
              The extraction is ready for review on the AI Validation page.
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetForNewIngest}
              className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft"
            >
              Ingest another meeting
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard/ai-validation")}
              className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90"
            >
              {processing.ready ? "Open AI Validation" : "Open AI Validation anyway"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <header className="mb-5">
        <p className="text-green text-xs font-black uppercase font-montserrat m-0">
          Ingest from Fireflies
        </p>
        <h1>Add a past meeting</h1>
        <p className="text-muted text-sm">
          Paste a Google Meet code (e.g. <code>rco-jucv-rwm</code>) or a
          Fireflies share URL. We&apos;ll detect the advisor + client, save
          the transcript, and run the 174-field extraction.
        </p>
      </header>

      {/* ── Step 1: URL form ── */}
      <form
        onSubmit={handlePreview}
        className="grid gap-3 p-4 border border-line rounded-2xl bg-white shadow-card mb-4"
      >
        <label className="grid gap-1">
          <span className="text-xs font-extrabold text-muted uppercase">
            Meet code or Fireflies URL
          </span>
          <input
            type="text"
            className="form-field w-full min-h-[44px] px-3 py-2 border border-line rounded-lg outline-none bg-white"
            placeholder="rco-jucv-rwm  or  https://app.fireflies.ai/view/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={previewing || ingesting}
            required
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={previewing || ingesting || !url.trim()}
            className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
          >
            {previewing ? "Fetching…" : "Fetch details"}
          </button>
        </div>
      </form>

      {/* ── Step 2: Preview card ── */}
      {preview && (
        <div className="p-4 border border-line rounded-2xl bg-white shadow-card">
          <div className="mb-3">
            <h2 className="text-lg font-bold m-0">{preview.title || "(no title)"}</h2>
            <p className="text-muted text-xs mt-1 m-0">
              {preview.date ? new Date(preview.date).toLocaleString() : "—"} ·{" "}
              {preview.duration_minutes} min · Fireflies id{" "}
              <code className="text-[11px]">{preview.fireflies_meeting_id}</code>
            </p>
          </div>

          {/* Attendee table */}
          <div className="mb-3">
            <p className="text-xs font-extrabold text-muted uppercase mb-1">
              Attendees ({preview.non_bot_attendees.length} non-bot)
            </p>
            <div className="grid gap-1.5">
              {preview.non_bot_attendees.map((a) => {
                const isAdvisor =
                  preview.advisor_match?.email.toLowerCase() === a.email.toLowerCase();
                const isClient =
                  preview.client?.email.toLowerCase() === a.email.toLowerCase();
                return (
                  <div
                    key={a.email}
                    className="flex items-center justify-between gap-2 p-2.5 border border-line rounded-lg bg-surface-soft"
                  >
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-extrabold text-ink truncate">
                        {a.displayName || a.email.split("@")[0]}
                      </p>
                      <p className="m-0 text-[11px] text-muted truncate">{a.email}</p>
                    </div>
                    {isAdvisor && (
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-[#d8fff6] text-ink">
                        Advisor ✓
                      </span>
                    )}
                    {isClient && (
                      preview.existing_client ? (
                        <span
                          className="text-[10px] font-black uppercase px-2 py-1 rounded bg-[#fff4d6] text-ink"
                          title={`Existing client (id ${preview.existing_client.id})`}
                        >
                          Client (existing)
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-surface text-muted">
                          Client (new)
                        </span>
                      )
                    )}
                    {!isAdvisor && !isClient && (
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-[rgba(202,78,78,0.06)] text-red">
                        Unmatched
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transcript status */}
          <div className="mb-3 text-xs">
            <span className="text-muted">Transcript: </span>
            {preview.transcript_ready ? (
              <span className="text-green font-extrabold">
                Ready ({preview.transcript_length.toLocaleString()} chars)
              </span>
            ) : (
              <span className="text-red font-extrabold">Not ready yet</span>
            )}
          </div>

          {/* Already-ingested notice */}
          {preview.already_ingested_meeting_id && !preview.would_skip_reason && (
            <div className="mb-3 px-3 py-2 border border-[rgba(202,150,40,0.35)] rounded-lg bg-[#fff8e6] text-[#7a5a14] text-sm">
              <strong>This meeting has already been ingested.</strong>{" "}
              {preview.extraction_exists
                ? "Re-analyzing will re-run the 174-field extraction and overwrite the existing one."
                : "The previous extraction did not complete. Re-analyzing will retry it."}
              {" "}No duplicate clients or transcripts will be created.
            </div>
          )}

          {/* Skip warning */}
          {preview.would_skip_reason && (
            <div className="mb-3 px-3 py-2 border border-[rgba(202,78,78,0.35)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-sm">
              Cannot ingest: {preview.would_skip_reason}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setUrl("");
              }}
              disabled={ingesting}
              className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft disabled:opacity-50"
            >
              Start over
            </button>
            <button
              type="button"
              onClick={handleIngestClick}
              disabled={!canIngest || ingesting}
              className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
            >
              {ingesting
                ? "Ingesting…"
                : preview?.already_ingested_meeting_id
                  ? "Re-analyze meeting"
                  : "Ingest meeting"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmReingest}
        title="Re-analyze this meeting?"
        message={
          preview?.extraction_exists ? (
            <>
              This meeting was already analyzed. Re-running will replace the
              existing 174-field extraction with a fresh one. The meeting,
              transcript, and client will <strong>not</strong> be duplicated.
            </>
          ) : (
            <>
              This meeting was already ingested but the extraction did not
              complete. We'll retry the 174-field extraction. The meeting
              and transcript stay as-is.
            </>
          )
        }
        variant="primary"
        confirmLabel={preview?.extraction_exists ? "Re-analyze" : "Retry analysis"}
        cancelLabel="Cancel"
        busy={ingesting}
        onConfirm={doIngest}
        onClose={() => !ingesting && setConfirmReingest(false)}
      />
    </div>
  );
}
