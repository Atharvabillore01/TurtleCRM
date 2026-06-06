import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  previewIngest,
  ingestMeeting,
  newIdempotencyKey,
  fetchAvailableAgents,
  IngestPreview,
  IngestResult,
  AgentOption,
  fetchExtractionForMeeting,
} from "../api/meetingApi";
import { showApiError } from "../utils/showApiError";

const POLL_INTERVAL_MS = 5_000;        // check every 5 seconds
const POLL_TIMEOUT_MS  = 10 * 60_000;  // give up after 10 min (covers 2hr meetings)
const PREVIEW_CONCURRENCY = 4;
const INGEST_CONCURRENCY  = 3;

type RowStatus =
  | "previewing"
  | "preview_error"
  | "ready"
  | "ingesting"
  | "extracting"
  | "done"
  | "failed";

interface Row {
  uid: string;
  input: string;
  status: RowStatus;
  preview: IngestPreview | null;
  previewError?: string;
  result?: IngestResult;
  ingestError?: string;
  meetingId?: string;
  startedAt?: number;
}

let _uidSeq = 0;
const nextUid = () => `row_${++_uidSeq}`;

/** Run an async worker over items with a bounded concurrency. */
async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

function canIngestRow(r: Row): boolean {
  const p = r.preview;
  return (
    !!p &&
    !p.would_skip_reason &&
    p.transcript_ready &&
    !!p.advisor_match &&
    !!p.client
  );
}

// ─── Agent multi-select ───────────────────────────────────────────────────────
function AgentMultiSelect({
  options,
  selected,
  onChange,
  disabled,
  dropUp,
}: {
  options: AgentOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  dropUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  const label =
    selected.length === 0
      ? "All agents"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} agents`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 min-h-[30px] px-3 border border-line rounded-lg bg-white text-xs font-extrabold text-ink hover:bg-surface-soft disabled:opacity-50 disabled:cursor-not-allowed"
        title="Choose which extraction agents run on this meeting"
      >
        <span className={selected.length === 0 ? "text-muted" : "text-ink"}>{label}</span>
        <span className="text-muted">▾</span>
      </button>

      {open && (
        <div className={`absolute right-0 z-20 w-[260px] max-h-[300px] overflow-y-auto overscroll-contain border border-line rounded-xl bg-white shadow-modal p-1.5 ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}>
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-left text-xs font-black ${
              selected.length === 0 ? "bg-[rgba(46,222,190,0.14)] text-ink" : "text-muted hover:bg-surface-soft"
            }`}
          >
            All agents (run everything)
            {selected.length === 0 && <span className="text-green">✓</span>}
          </button>
          <div className="my-1 border-t border-line" />
          {options.map((a) => {
            const on = selected.includes(a.name);
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => toggle(a.name)}
                className={`flex items-center justify-between gap-2 w-full px-2.5 py-2 rounded-lg text-left ${
                  on ? "bg-[rgba(46,222,190,0.10)]" : "hover:bg-surface-soft"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-ink truncate">{a.touch_point}</span>
                  <span className="block text-[10px] text-muted truncate">{a.name}</span>
                </span>
                <span
                  className={`grid place-items-center w-4 h-4 rounded border shrink-0 ${
                    on ? "bg-green border-green text-ink" : "border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Per-row status badge ─────────────────────────────────────────────────────
function StatusBadge({ row }: { row: Row }) {
  const map: Record<RowStatus, { text: string; cls: string }> = {
    previewing:    { text: "Fetching…",    cls: "bg-[#fff8e6] text-[#7a5a14]" },
    preview_error: { text: "Fetch failed", cls: "bg-[rgba(202,78,78,0.08)] text-red" },
    ready:         { text: "Ready",        cls: "bg-[#d8fff6] text-[#0f6e5d]" },
    ingesting:     { text: "Ingesting…",   cls: "bg-[#fff8e6] text-[#7a5a14]" },
    extracting:    { text: "Extracting…",  cls: "bg-[#fff8e6] text-[#7a5a14]" },
    done:          { text: "Done ✓",       cls: "bg-[#d8fff6] text-[#0f6e5d]" },
    failed:        { text: "Failed",       cls: "bg-[rgba(202,78,78,0.08)] text-red" },
  };
  const s = map[row.status];
  return (
    <span className={`inline-flex items-center min-h-[22px] px-2.5 rounded-full text-[10px] font-black uppercase tracking-wide ${s.cls}`}>
      {s.text}
    </span>
  );
}

/**
 * Manual Fireflies ingest — batch capable.
 *
 *   1. Paste one code/URL per line (and/or add lines) → "Fetch all" runs
 *      /ingest/preview for each, producing a row with attendee diagnostics.
 *   2. Per row, pick which extraction agents to run (default: all).
 *   3. "Ingest all" runs /ingest for every ingestable row (bounded
 *      concurrency), each carrying its own agents_to_use, then polls each
 *      meeting's extraction independently.
 */
export default function IngestMeetingPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"single" | "multiple">("single");
  const [inputs, setInputs] = useState<{ uid: string; value: string }[]>([{ uid: nextUid(), value: "" }]);
  const [rows, setRows] = useState<Row[]>([]);
  const [agents, setAgents] = useState<string[]>([]); // shared selection — applied to every ingested meeting
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [previewingAll, setPreviewingAll] = useState(false);
  const [ingestingAll, setIngestingAll] = useState(false);

  // Keep a ref to the latest rows so the single polling interval can read them.
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;

  // Focus management for the entry builder — focus a row right after it's added.
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusUid, setFocusUid] = useState<string | null>(null);
  useEffect(() => {
    if (focusUid && inputRefs.current[focusUid]) {
      inputRefs.current[focusUid]!.focus();
      setFocusUid(null);
    }
  }, [focusUid, inputs]);

  useEffect(() => {
    fetchAvailableAgents()
      .then(setAgentOptions)
      .catch(() => {/* non-fatal: agent picker just shows empty */});
  }, []);

  const updateRow = (uid: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  // Switch entry mode — resets the in-progress entry/fetched rows so the two
  // flows never get tangled. Disabled in the UI while anything is processing.
  const switchMode = (next: "single" | "multiple") => {
    if (next === mode) return;
    setMode(next);
    setRows([]);
    setInputs([{ uid: nextUid(), value: "" }]);
  };

  // ── Entry-builder helpers ──
  const setInputValue = (uid: string, value: string) =>
    setInputs((is) => is.map((i) => (i.uid === uid ? { ...i, value } : i)));

  const addInput = (afterUid?: string) => {
    const uid = nextUid();
    setInputs((is) => {
      if (!afterUid) return [...is, { uid, value: "" }];
      const idx = is.findIndex((i) => i.uid === afterUid);
      return [...is.slice(0, idx + 1), { uid, value: "" }, ...is.slice(idx + 1)];
    });
    setFocusUid(uid);
  };

  const removeInput = (uid: string) =>
    setInputs((is) => {
      const next = is.filter((i) => i.uid !== uid);
      return next.length ? next : [{ uid: nextUid(), value: "" }];
    });

  // Smart paste: a multi-line / comma-separated blob explodes into rows.
  // Single-meeting mode pastes normally (one meeting only).
  const handlePaste = (uid: string, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (mode === "single") return;
    const text = e.clipboardData.getData("text");
    const tokens = text.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length <= 1) return; // single value → let the browser paste normally
    e.preventDefault();
    setInputs((is) => {
      const idx = is.findIndex((i) => i.uid === uid);
      const exploded = tokens.map((t) => ({ uid: nextUid(), value: t }));
      return [...is.slice(0, idx), ...exploded, ...is.slice(idx + 1)];
    });
  };

  // ── Take the entry rows, create preview-pending Rows, then fetch them ──
  async function handleFetchAll(e?: React.FormEvent) {
    e?.preventDefault();
    const existing = new Set(rows.map((r) => r.input.toLowerCase()));
    const values = Array.from(
      new Set(inputs.map((i) => i.value.trim()).filter(Boolean)),
    ).filter((v) => !existing.has(v.toLowerCase()));

    if (values.length === 0) {
      if (inputs.some((i) => i.value.trim())) toast("Those meetings are already in the list.", { icon: "ℹ️" });
      return;
    }

    const newRows: Row[] = values.map((input) => ({
      uid: nextUid(),
      input,
      status: "previewing",
      preview: null,
    }));
    setRows((rs) => [...rs, ...newRows]);
    setInputs([{ uid: nextUid(), value: "" }]); // reset the entry builder

    setPreviewingAll(true);
    try {
      await runPool(
        newRows,
        async (row) => {
          try {
            const preview = await previewIngest(row.input);
            updateRow(row.uid, { preview, status: "ready" });
          } catch (err: any) {
            updateRow(row.uid, {
              status: "preview_error",
              previewError: err?.response?.data?.detail || "Could not fetch this meeting.",
            });
          }
        },
        PREVIEW_CONCURRENCY,
      );
    } finally {
      setPreviewingAll(false);
    }
  }

  function removeRow(uid: string) {
    setRows((rs) => rs.filter((r) => r.uid !== uid));
  }

  // ── Ingest every ingestable row, all carrying the shared agents_to_use ──
  async function handleIngestAll() {
    const targets = rowsRef.current.filter(
      (r) => (r.status === "ready" || r.status === "failed") && canIngestRow(r),
    );
    if (targets.length === 0) {
      toast("No meetings are ready to ingest.", { icon: "ℹ️" });
      return;
    }

    setIngestingAll(true);
    try {
      await runPool(
        targets,
        async (row) => {
          updateRow(row.uid, { status: "ingesting", ingestError: undefined });
          try {
            const result = await ingestMeeting(row.input, newIdempotencyKey(), agents);
            updateRow(row.uid, {
              status: "extracting",
              result,
              meetingId: result.meeting_id,
              startedAt: Date.now(),
            });
          } catch (err: any) {
            updateRow(row.uid, {
              status: "failed",
              ingestError: err?.response?.data?.detail || "Ingest failed.",
            });
          }
        },
        INGEST_CONCURRENCY,
      );
    } finally {
      setIngestingAll(false);
    }
  }

  // ── One interval polls every row in the "extracting" state ──
  useEffect(() => {
    const anyExtracting = rows.some((r) => r.status === "extracting");
    if (!anyExtracting) return;

    const timer = window.setInterval(async () => {
      const extracting = rowsRef.current.filter((r) => r.status === "extracting");
      await Promise.all(
        extracting.map(async (row) => {
          if (row.startedAt && Date.now() - row.startedAt > POLL_TIMEOUT_MS) {
            updateRow(row.uid, { status: "done" }); // give up gracefully; keeps processing server-side
            toast(`${row.result?.client_name ?? "A meeting"} is still extracting — check AI Validation later.`, {
              icon: "⏱️",
              duration: 7_000,
            });
            return;
          }
          try {
            const extraction = await fetchExtractionForMeeting(row.meetingId!);
            if (extraction) {
              updateRow(row.uid, { status: "done" });
              toast.success(
                `Extraction ready for ${row.result?.client_name ?? "meeting"} — ${extraction.total_fields} fields.`,
                { duration: 5_000 },
              );
            }
          } catch {
            /* transient — keep polling */
          }
        }),
      );
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [rows]);

  // ── Derived counts for the action bar ──
  const counts = useMemo(() => {
    const ready = rows.filter((r) => (r.status === "ready" || r.status === "failed") && canIngestRow(r)).length;
    const busy = rows.filter((r) => r.status === "ingesting" || r.status === "extracting").length;
    const done = rows.filter((r) => r.status === "done").length;
    return { ready, busy, done, total: rows.length };
  }, [rows]);

  // How many entry rows would actually be fetched (non-empty, unique, new).
  const pendingCount = useMemo(() => {
    const existing = new Set(rows.map((r) => r.input.toLowerCase()));
    return new Set(
      inputs.map((i) => i.value.trim().toLowerCase()).filter((v) => v && !existing.has(v)),
    ).size;
  }, [inputs, rows]);

  return (
    <div className="max-w-4xl mx-auto p-4">
      <header className="mb-5">
        <p className="text-green text-xs font-black uppercase font-montserrat m-0">Ingest from Fireflies</p>
        <h1>{mode === "single" ? "Add a meeting" : "Add meetings"}</h1>
        <p className="text-muted text-sm">
          Paste a Google Meet code (e.g. <code>rco-jucv-rwm</code>) or Fireflies URL. We detect
          advisor + client, then run the extraction with your selected agents.
        </p>
      </header>

      {/* ── Mode toggle ── */}
      <div className="inline-flex items-center gap-1 p-1 border border-line rounded-lg bg-[#f9f9f9] mb-4">
        {([
          ["single", "Single meeting"],
          ["multiple", "Multiple meetings"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            disabled={previewingAll || ingestingAll || counts.busy > 0}
            className={`min-h-[30px] px-4 rounded-md text-xs font-black cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === m ? "bg-white border border-line text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Entry ── */}
      <form
        onSubmit={handleFetchAll}
        className="grid gap-2 p-4 border border-line rounded-2xl bg-white shadow-card mb-4"
      >
        <span className="text-xs font-extrabold text-muted uppercase">
          {mode === "single" ? "Meeting" : "Meetings to add"}
          {mode === "multiple" && (
            <span className="font-normal normal-case"> — one per row (paste a list to split automatically)</span>
          )}
        </span>

        <div className="grid gap-2">
          {(mode === "single" ? inputs.slice(0, 1) : inputs).map((it, idx) => (
            <div key={it.uid} className="flex items-center gap-2">
              {mode === "multiple" && (
                <span className="w-6 shrink-0 text-right text-xs font-black text-muted tabular-nums">{idx + 1}</span>
              )}
              <input
                ref={(el) => { inputRefs.current[it.uid] = el; }}
                type="text"
                className="form-field flex-1 min-w-0 min-h-[42px] px-3 py-2 border border-line rounded-lg outline-none bg-white font-mono text-sm"
                placeholder={idx === 0 ? "rco-jucv-rwm  or  https://app.fireflies.ai/view/..." : "another meeting…"}
                value={it.value}
                disabled={previewingAll}
                onChange={(e) => setInputValue(it.uid, e.target.value)}
                onPaste={(e) => handlePaste(it.uid, e)}
                onKeyDown={(e) => {
                  if (mode === "multiple" && e.key === "Enter") {
                    e.preventDefault();
                    if (e.currentTarget.value.trim()) addInput(it.uid);
                  }
                }}
              />
              {mode === "multiple" && (
                <button
                  type="button"
                  onClick={() => removeInput(it.uid)}
                  disabled={previewingAll || (inputs.length === 1 && !it.value.trim())}
                  className="shrink-0 w-9 h-9 grid place-items-center border border-line rounded-lg bg-white text-muted hover:bg-surface-soft hover:text-red disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove this row"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {mode === "multiple" ? (
            <button
              type="button"
              onClick={() => addInput()}
              disabled={previewingAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-line rounded-lg bg-white text-ink text-xs font-black hover:bg-surface-soft disabled:opacity-50"
            >
              + Add meeting
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={previewingAll || pendingCount === 0}
            className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
          >
            {previewingAll
              ? "Fetching…"
              : mode === "single"
              ? "Fetch details"
              : `${rows.length ? "Add" : "Fetch"} ${pendingCount || ""} ${pendingCount === 1 ? "meeting" : "meetings"}`.replace(/\s+/g, " ").trim()}
          </button>
        </div>
      </form>

      {/* ── Rows ── */}
      {rows.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-extrabold text-muted uppercase m-0">
              Meetings ({rows.length})
            </p>
            {counts.done > 0 && (
              <button
                type="button"
                onClick={() => navigate("/dashboard/ai-validation")}
                className="text-xs font-black text-[#138773] hover:underline"
              >
                Open AI Validation →
              </button>
            )}
          </div>

          <div className="grid gap-2.5">
            {rows.map((row) => {
              const p = row.preview;
              const locked = row.status === "ingesting" || row.status === "extracting" || row.status === "done";
              return (
                <div key={row.uid} className="p-3.5 border border-line rounded-2xl bg-white shadow-card">
                  {/* Row header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-extrabold text-ink m-0 truncate">
                          {p?.title || row.input}
                        </h3>
                        <StatusBadge row={row} />
                      </div>
                      <p className="text-[11px] text-muted mt-0.5 m-0 truncate">
                        {p
                          ? `${p.date ? new Date(p.date).toLocaleString() : "—"} · ${p.duration_minutes} min · ${row.input}`
                          : row.input}
                      </p>
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.uid)}
                        className="shrink-0 w-7 h-7 grid place-items-center border border-line rounded-lg bg-white text-muted hover:bg-surface-soft hover:text-red"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Preview error */}
                  {row.status === "preview_error" && (
                    <div className="px-3 py-2 border border-[rgba(202,78,78,0.3)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-xs">
                      {row.previewError}
                    </div>
                  )}

                  {/* Ingest error */}
                  {row.status === "failed" && row.ingestError && (
                    <div className="px-3 py-2 border border-[rgba(202,78,78,0.3)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-xs mb-2">
                      {row.ingestError}
                    </div>
                  )}

                  {/* Preview body */}
                  {p && (
                    <>
                      {/* Match summary */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
                        {p.advisor_match ? (
                          <span className="px-2 py-1 rounded bg-[#d8fff6] text-ink font-black">
                            Advisor: {p.advisor_match.full_name}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-[rgba(202,78,78,0.06)] text-red font-black">
                            No advisor matched
                          </span>
                        )}
                        {p.client && (
                          <span
                            className={`px-2 py-1 rounded font-black ${
                              p.existing_client ? "bg-[#fff4d6] text-ink" : "bg-surface text-muted"
                            }`}
                          >
                            Client: {p.client.displayName || p.client.email.split("@")[0]}
                            {p.existing_client ? " (existing)" : " (new)"}
                          </span>
                        )}
                        <span className={p.transcript_ready ? "px-2 py-1 rounded bg-surface-soft text-green font-black" : "px-2 py-1 rounded bg-surface-soft text-red font-black"}>
                          {p.transcript_ready ? `Transcript ${p.transcript_length.toLocaleString()} chars` : "Transcript not ready"}
                        </span>
                      </div>

                      {p.would_skip_reason && (
                        <div className="px-3 py-2 mb-2 border border-[rgba(202,78,78,0.3)] rounded-lg bg-[rgba(202,78,78,0.06)] text-red text-xs">
                          Cannot ingest: {p.would_skip_reason}
                        </div>
                      )}

                      {p.already_ingested_meeting_id && !p.would_skip_reason && (
                        <div className="px-3 py-2 border border-[rgba(202,150,40,0.35)] rounded-lg bg-[#fff8e6] text-[#7a5a14] text-xs">
                          Already ingested — ingesting again will re-run extraction (no duplicate client/transcript).
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Action bar ── */}
          <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 px-4 py-3 border border-line rounded-2xl bg-white/95 backdrop-blur shadow-card">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted whitespace-nowrap">
                {mode === "single" ? "Agents:" : "Agents (all):"}
              </span>
              <AgentMultiSelect
                options={agentOptions}
                selected={agents}
                onChange={setAgents}
                disabled={ingestingAll || counts.busy > 0}
                dropUp
              />
              <span className="hidden md:inline text-xs text-muted whitespace-nowrap ml-2">
                {counts.ready} ready · {counts.busy} processing · {counts.done} done
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRows([])}
                disabled={ingestingAll || counts.busy > 0}
                className="px-4 py-2 border border-line rounded-lg bg-white text-ink hover:bg-surface-soft disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleIngestAll}
                disabled={ingestingAll || counts.ready === 0}
                className="px-4 py-2 border border-[#138773] rounded-lg bg-[#138773] text-white font-extrabold hover:opacity-90 disabled:opacity-50"
              >
                {ingestingAll
                  ? "Ingesting…"
                  : mode === "single"
                  ? "Ingest meeting"
                  : `Ingest ${counts.ready || ""} ${counts.ready === 1 ? "meeting" : "meetings"}`.replace(/\s+/g, " ").trim()}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
