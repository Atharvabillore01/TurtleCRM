import React, { useEffect, useMemo, useState } from "react";
import {
  fetchExtractions,
  fetchExtractionTokenUsage,
  agentLabel,
  type Extraction,
  type AgentTokenUsage,
} from "../api/meetingApi";
import { showApiError } from "../utils/showApiError";

// Compact number formatter — 12,345 tokens reads better than 12345.
const fmt = (n: number | undefined | null) =>
  (n ?? 0).toLocaleString("en-IN");

function meetingLabel(e: Extraction): string {
  return (
    e.meeting_title ||
    (e.meeting_id ? `Meeting ${e.meeting_id.slice(-6)}` : "Untitled meeting")
  );
}

function clientLabel(e: Extraction): string {
  return (Array.isArray(e.client_names) && e.client_names[0]) || "—";
}

/**
 * Token Usage screen — one row per extraction (meeting), showing the total
 * tokens consumed and, when expanded, the per-agent breakdown
 * ("which agent charged how much for that meeting").
 */
export default function TokenUsagePage() {
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Expanded row state: extraction_id → per-agent rows (or "loading"/"error").
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [breakdowns, setBreakdowns] = useState<
    Record<string, AgentTokenUsage[] | "loading" | "error">
  >({});

  useEffect(() => {
    fetchExtractions()
      .then((rows) => setExtractions(rows || []))
      .catch((err) => setLoadError(err?.message || "Failed to load extractions"))
      .finally(() => setLoading(false));
  }, []);

  async function toggleRow(e: Extraction) {
    const id = e.id;
    const nowOpen = !expanded[id];
    setExpanded((s) => ({ ...s, [id]: nowOpen }));
    if (nowOpen && breakdowns[id] === undefined) {
      setBreakdowns((s) => ({ ...s, [id]: "loading" }));
      try {
        const res = await fetchExtractionTokenUsage(id);
        setBreakdowns((s) => ({ ...s, [id]: res.agents }));
      } catch (err) {
        setBreakdowns((s) => ({ ...s, [id]: "error" }));
        showApiError(err, "Failed to load token breakdown.");
      }
    }
  }

  const grandTotal = useMemo(
    () => extractions.reduce((sum, e) => sum + (e.total_tokens || 0), 0),
    [extractions],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-slate-500">
        Loading token usage…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full py-24 text-red-500">
        Failed to load token usage: {loadError}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Token Usage</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tokens each AI agent consumed per meeting. Click a row for the
            per-agent breakdown.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-gray-400">
            Total across {extractions.length} extraction
            {extractions.length === 1 ? "" : "s"}
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {fmt(grandTotal)} tokens
          </div>
        </div>
      </div>

      {extractions.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          No extractions yet. Once a meeting is transcribed and processed,
          its token usage shows up here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-2.5 w-8"></th>
                <th className="px-4 py-2.5">Meeting</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Input</th>
                <th className="px-4 py-2.5 text-right">Output</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {extractions.map((e) => {
                const isOpen = !!expanded[e.id];
                const detail = breakdowns[e.id];
                return (
                  <React.Fragment key={e.id}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleRow(e)}
                    >
                      <td className="px-4 py-3 text-gray-400 select-none">
                        {isOpen ? "▾" : "▸"}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {meetingLabel(e)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{clientLabel(e)}</td>
                      <td className="px-4 py-3 text-gray-600">{e.model || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {(e.meeting_start_time || e.extracted_at || "").slice(0, 10) || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {fmt(e.total_input_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {fmt(e.total_output_tokens)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {fmt(e.total_tokens)}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td></td>
                        <td colSpan={7} className="px-4 pb-4 pt-1">
                          {detail === "loading" || detail === undefined ? (
                            <div className="text-gray-400 py-2">Loading breakdown…</div>
                          ) : detail === "error" ? (
                            <div className="text-red-500 py-2">
                              Couldn’t load the per-agent breakdown.
                            </div>
                          ) : detail.length === 0 ? (
                            <div className="text-gray-400 py-2">
                              No per-agent token data recorded for this extraction.
                            </div>
                          ) : (
                            <table className="w-full text-sm mt-1">
                              <thead>
                                <tr className="text-gray-400 text-left text-xs uppercase tracking-wide">
                                  <th className="px-3 py-1.5">Agent</th>
                                  <th className="px-3 py-1.5 text-right">Input</th>
                                  <th className="px-3 py-1.5 text-right">Output</th>
                                  <th className="px-3 py-1.5 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.map((a) => (
                                  <tr key={a.agent} className="border-t border-gray-100">
                                    <td className="px-3 py-1.5 text-gray-700">
                                      {agentLabel(a.agent)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                                      {fmt(a.input_tokens)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                                      {fmt(a.output_tokens)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">
                                      {fmt(a.total_tokens)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
