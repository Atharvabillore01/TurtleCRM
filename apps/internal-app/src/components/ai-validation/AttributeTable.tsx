import React from "react";

// confidence_level → human-readable label (mirrors the crm-agent levels).
const CONFIDENCE_LABELS: Record<string, string> = {
  exact_quote:       "Exact quote",
  clearly_inferable: "Clearly inferable",
  estimated:         "Estimated",
  indirect:          "Indirect",
  speculative:       "Speculative",
  not_extracted:     "Not extracted",
};

function confidencePct(c: unknown): number | null {
  return typeof c === "number" && !Number.isNaN(c) ? Math.round(c * 100) : null;
}

// Chip tone by confidence band: high = teal, medium = amber, low = red.
function confidenceTone(c: unknown): string {
  if (typeof c !== "number") return "bg-gray-100 text-gray-500";
  if (c >= 0.8) return "bg-[#d8fff6] text-[#0f6e5d]";
  if (c >= 0.6) return "bg-amber-100 text-amber-700";
  return "bg-[#ffe8e5] text-red";
}

export default function AttributeTable({
  rows,
  draftValues,
  editingKey,
  setEditingKey,
  setDraftValues,
  onSave,
  onApprove,
  onReject,
}: any) {
  return (
    <div className="max-h-[calc(100vh-430px)] min-h-[440px] overflow-y-auto overflow-x-hidden border border-line rounded-lg bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)] shadow-[inset_0_1px_0_rgba(46,222,190,0.2)] mobile:max-h-none">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr>
            <th className="w-[34%]">Attribute</th>
            <th className="w-[36%]">AI figured value</th>
            <th className="w-[30%] mobile:w-auto">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => {
            // Defensive: even if a stale editingKey points at this row,
            // refuse to enter edit mode when the extraction is locked.
            const isEditing = editingKey === row.attribute.id && !row.readOnly;
            const draftValue = draftValues[row.attribute.id] ?? row.displayValue ?? "";

            return (
              <tr key={row.attribute.id} className={row.isNull ? "bg-[#fffdfd]" : ""}>
                <td className="w-[34%] mobile:w-auto">
                  <strong>{row.attribute.label}</strong>
                  <span>{row.attribute.id}</span>
                </td>
                <td className="w-[36%] mobile:w-auto">
                  {isEditing ? (
                    <input
                      className="w-full min-h-[38px] py-2 px-[10px] border border-[rgba(46,222,190,0.78)] rounded-lg outline-none"
                      value={draftValue}
                      onChange={(event) =>
                        setDraftValues((current: any) => ({
                          ...current,
                          [row.attribute.id]: event.target.value,
                        }))
                      }
                      autoFocus
                    />
                  ) : (
                    <div className="grid justify-items-start gap-1 w-full">
                      <span
                        className={`inline-flex items-center max-w-full min-h-7 py-[6px] px-[10px] rounded-full text-xs font-black leading-[1.45] [overflow-wrap:anywhere] whitespace-normal ${
                          row.isNull
                            ? "bg-[#ffe8e5] text-red font-mono"
                            : row.isApproved
                            ? "bg-[#d8fff6] text-ink shadow-[inset_0_0_0_1px_rgba(46,222,190,0.35)]"
                            : "bg-[#e9fbf7] text-ink"
                        }`}
                      >
                        {row.isNull ? "null" : row.displayValue}
                      </span>
                      {row.isApproved && (
                        <small className="text-green text-[11px] font-extrabold">Approved for this client</small>
                      )}
                      {row.isRejected && (
                        <small className="text-red text-[11px] font-extrabold">Rejected in this meeting</small>
                      )}

                      {/* Confidence · confidence type · evidence */}
                      {!row.isNull &&
                        (confidencePct(row.confidence) !== null ||
                          row.confidence_level ||
                          row.source) && (
                          <div className="flex flex-col gap-1 mt-0.5 w-full">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {confidencePct(row.confidence) !== null && (
                                <span
                                  className={`inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-black ${confidenceTone(
                                    row.confidence,
                                  )}`}
                                  title="AI confidence score"
                                >
                                  {confidencePct(row.confidence)}%
                                </span>
                              )}
                              {row.confidence_level && (
                                <span
                                  className="inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-bold bg-[rgba(46,222,190,0.10)] text-[#137765] uppercase tracking-wide"
                                  title="Confidence type"
                                >
                                  {CONFIDENCE_LABELS[row.confidence_level] ?? row.confidence_level}
                                </span>
                              )}
                            </div>
                            {row.source && (
                              <p
                                className="text-[11px] text-gray-500 italic leading-snug [overflow-wrap:anywhere]"
                                title={row.source}
                              >
                                “{row.source.length > 220 ? row.source.slice(0, 220) + "…" : row.source}”
                              </p>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </td>
                <td className="w-[30%] mobile:w-auto">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        className="flex justify-center items-center flex-1 min-w-[82px] min-h-[30px] border border-green rounded-lg bg-green text-ink text-xs font-black font-montserrat leading-none cursor-pointer"
                        type="button"
                        onClick={() => onSave(row.attribute.id)}
                        aria-label="Save"
                      >
                        {"✓"}
                      </button>
                      <button
                        className="flex justify-center items-center flex-none w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
                        type="button"
                        onClick={() => setEditingKey(null)}
                        aria-label="Cancel"
                      >
                        {"✕"}
                      </button>
                    </div>
                  ) : row.readOnly ? (
                    // Extraction is validated — no edits allowed. Just show
                    // a lock chip so reviewers know why nothing's clickable.
                    <span
                      className="inline-flex items-center justify-center min-h-[30px] px-3 border border-[rgba(46,222,190,0.45)] rounded-lg bg-[#d8fff6] text-[#0f6e5d] text-[11px] font-black font-montserrat uppercase tracking-wider"
                      title="This extraction is validated and locked"
                    >
                      Locked
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        className="flex justify-center items-center flex-none w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                        type="button"
                        aria-label="Edit"
                        disabled={row.readOnly}
                        onClick={() => {
                          setEditingKey(row.attribute.id);
                          setDraftValues((current: any) => ({
                            ...current,
                            [row.attribute.id]: row.displayValue ?? "",
                          }));
                        }}
                      >
                        {"✎"}
                      </button>
                      <button
                        className="flex justify-center items-center flex-1 min-w-[82px] min-h-[30px] border border-[rgba(46,222,190,0.45)] rounded-lg bg-white text-[#137765] text-xs font-black font-montserrat leading-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                        type="button"
                        aria-label="Approve"
                        disabled={row.isNull || row.isApproved || row.readOnly}
                        onClick={() => onApprove(row.attribute.id, row.displayValue)}
                      >
                        {"✓"}
                      </button>
                      <button
                        className="flex justify-center items-center flex-1 min-w-[82px] min-h-[30px] border border-[rgba(202,78,78,0.35)] rounded-lg bg-white text-red text-xs font-black font-montserrat leading-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                        type="button"
                        aria-label="Reject"
                        disabled={row.isNull || row.isRejected || row.readOnly}
                        onClick={() => onReject(row.attribute.id)}
                      >
                        {"✕"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
