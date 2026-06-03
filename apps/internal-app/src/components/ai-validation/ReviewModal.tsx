import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowRight01Icon,
  Edit02Icon,
  CheckmarkCircle02Icon,
  Add01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons";

// Touch point definitions
export const TOUCH_POINTS = [
  "Turtle ID",
  "Demographics & Family",
  "Contact Details",
  "Acquisition",
  "Internal",
  "Finances",
  "Life Goals (with Priorities)",
  "Professional Details",
  "Travel Dates",
  "Schedule & Communication",
  "Task Priority",
  "Custom Fields (text)",
  "AI Advisory",
  "Attachments (PDFs)",
  "Qualitative Parameters",
  "Special Projects/VAS (opted)",
  "Advisor",
  "Campaign (opted)",
  "Engagement",
];

// Map old category names → touch point names
const CATEGORY_TO_TOUCH_POINT = {
  Personal: "Demographics & Family",
  Family: "Demographics & Family",
  Tax: "Finances",
  Income: "Finances",
  Planning: "Life Goals (with Priorities)",
  Insurance: "Finances",
  Investments: "Finances",
  NRI: "Turtle ID",
  Cashflow: "Finances",
  Estate: "Qualitative Parameters",
  Documents: "Attachments (PDFs)",
};

const PRIORITY_BADGE = {
  High: "bg-[rgba(255,80,80,0.1)] text-red border-[rgba(255,80,80,0.25)]",
  Medium: "bg-[rgba(255,193,87,0.12)] text-[#946200] border-[rgba(255,193,87,0.3)]",
  Low: "bg-[rgba(46,222,190,0.1)] text-[#137765] border-[rgba(46,222,190,0.25)]",
};

// Friendly labels for the crm-agent confidence levels. "not_extracted" (and
// anything unknown) maps to nothing → the type chip is simply hidden.
const CONFIDENCE_TYPE_LABELS: Record<string, string> = {
  exact_quote: "Exact quote",
  clearly_inferable: "Clearly inferable",
  estimated: "Estimated",
  indirect: "Indirect",
  speculative: "Speculative",
};

export function mapCategoryToTouchPoint(category: any) {
  // DB-driven extractions already carry a real touch-point name
  // (fn_get_extraction → field_definitions.touch_point), so pass it through
  // unchanged. Only the legacy mock category names need remapping.
  if (typeof category === "string" && (TOUCH_POINTS as string[]).includes(category)) {
    return category;
  }
  return (CATEGORY_TO_TOUCH_POINT as any)[category] || "Internal";
}

// ─── Single attribute row ─────────────────────────────────────────────────────
function AttributeRow({
  row,
  draftValues,
  editingKey,
  setEditingKey,
  setDraftValues,
  onSave,
  onApprove,
  onReject,
}: any) {
  // Defensive: a stale editingKey must not unlock a locked row.
  const isEditing = editingKey === row.attribute.id && !row.readOnly;
  const draftValue = draftValues[row.attribute.id] ?? row.displayValue ?? "";

  return (
    <div
      className={`grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-2.5 border-b border-[rgba(215,239,234,0.5)] last:border-0 ${
        row.isNull ? "bg-[#fffafa]" : "bg-white"
      }`}
    >
      {/* Attribute label */}
      <div className="min-w-0">
        <p className="m-0 text-sm font-extrabold text-ink truncate" title={row.attribute.label}>{row.attribute.label}</p>
        {typeof row.confidence === "number" && row.confidence > 0 ? (
          <span className="inline-flex items-center gap-1 mt-0.5 flex-wrap">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                row.confidence >= 0.8 ? "bg-green" : row.confidence >= 0.6 ? "bg-[#f5a623]" : "bg-[#ddd]"
              }`}
            />
            <span className="text-[10px] text-muted">{Math.round(row.confidence * 100)}% confidence</span>
            {CONFIDENCE_TYPE_LABELS[row.confidence_level] && (
              <span className="text-[10px] text-muted">· {CONFIDENCE_TYPE_LABELS[row.confidence_level]}</span>
            )}
          </span>
        ) : (
          <p className="m-0 text-[10px] text-muted">Not extracted</p>
        )}
      </div>

      {/* Value */}
      <div className="min-w-0">
        {isEditing ? (
          <input
            className="w-full min-h-[34px] py-1.5 px-3 border border-[rgba(46,222,190,0.78)] rounded-lg outline-none text-sm bg-white"
            value={draftValue}
            onChange={(e) =>
              setDraftValues((c: any) => ({ ...c, [row.attribute.id]: e.target.value }))
            }
            autoFocus
          />
        ) : (
          <div className="flex flex-col gap-0.5 items-start">
            <span
              className={`inline-flex items-center max-w-full px-2.5 py-[3px] rounded-full text-xs font-bold [overflow-wrap:anywhere] whitespace-normal ${
                row.isNull
                  ? "bg-[#ffe8e5] text-red"
                  : row.isApproved
                  ? "bg-[#d3fdf4] text-[#137765] ring-1 ring-[rgba(46,222,190,0.4)]"
                  : "bg-[#eaf9f5] text-ink"
              }`}
            >
              {row.isNull ? "null" : row.displayValue}
            </span>
            {!row.isNull && row.source && (
              <span
                className="text-[10px] text-muted italic leading-snug [overflow-wrap:anywhere] line-clamp-2"
                title={row.source}
              >
                {row.source}
              </span>
            )}
            {row.isApproved && (
              <span className="text-green text-[10px] font-black">✓ Approved</span>
            )}
            {row.isRejected && (
              <span className="text-red text-[10px] font-black">✕ Rejected</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => onSave(row.attribute.id)}
              className="min-h-[30px] px-3 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingKey(null)}
              className="min-h-[30px] px-3 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : row.readOnly ? (
          <span
            className="inline-flex items-center min-h-[28px] px-2.5 border border-[rgba(46,222,190,0.45)] rounded-lg bg-[#d8fff6] text-[#0f6e5d] text-[10px] font-black uppercase tracking-wider"
            title="Validated extraction — edits locked"
          >
            Locked
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={row.readOnly}
              onClick={() => {
                setEditingKey(row.attribute.id);
                setDraftValues((c: any) => ({ ...c, [row.attribute.id]: row.displayValue ?? "" }));
              }}
              className="min-h-[28px] px-2.5 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer hover:bg-[#f5f5f5] disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={row.isNull || row.isApproved || row.readOnly}
              onClick={() => onApprove(row.attribute.id, row.displayValue)}
              className="min-h-[28px] px-2.5 border border-[rgba(46,222,190,0.5)] rounded-lg bg-white text-[#137765] text-xs font-black cursor-pointer hover:bg-[rgba(46,222,190,0.06)] disabled:opacity-35 disabled:cursor-not-allowed"
            >
              ✓
            </button>
            <button
              type="button"
              disabled={row.isNull || row.isRejected || row.readOnly}
              onClick={() => onReject(row.attribute.id)}
              className="min-h-[28px] px-2.5 border border-[rgba(202,78,78,0.4)] rounded-lg bg-white text-red text-xs font-black cursor-pointer hover:bg-[rgba(202,78,78,0.05)] disabled:opacity-35 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Touch-point accordion ────────────────────────────────────────────────────
function TouchPointAccordion({
  touchPoint,
  rows,
  draftValues,
  editingKey,
  setEditingKey,
  setDraftValues,
  onSave,
  onApprove,
  onReject,
  isOpen,
  onToggle,
}: any) {
  const filled = rows.filter((r: any) => !r.isNull).length;
  const total = rows.length;
  const allFilled = filled === total;
  const noneFilled = filled === 0;

  return (
    <div className="rounded-xl border border-line overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full px-4 py-[10px] bg-[#f7fdfb] hover:bg-[#eef9f6] transition-colors cursor-pointer border-b border-line"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              allFilled ? "bg-green" : noneFilled ? "bg-[#ddd]" : "bg-[#f5a623]"
            }`}
          />
          <span className="text-sm font-black text-ink">{touchPoint}</span>
          <span className="text-xs text-muted font-normal">
            {filled}/{total} filled
          </span>
        </div>
        <HugeiconsIcon
          icon={isOpen ? ArrowUp01Icon : ArrowDown01Icon}
          size={14}
          strokeWidth={2.5}
          className="text-muted shrink-0"
        />
      </button>

      {/* Column headers & Rows — only when open */}
      {isOpen && (
        <div className="max-h-[50vh] overflow-y-auto relative">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-4 py-1.5 bg-[#fafafa] border-b border-[rgba(215,239,234,0.5)] sticky top-0 z-10">
            <span className="text-[10px] font-black text-muted uppercase tracking-wide">Attribute</span>
            <span className="text-[10px] font-black text-muted uppercase tracking-wide">AI Value</span>
            <span className="text-[10px] font-black text-muted uppercase tracking-wide">Actions</span>
          </div>

          <div className="flex flex-col pb-9">
            {rows.map((row: any) => (
              <AttributeRow
                key={row.attribute.id}
                row={row}
                draftValues={draftValues}
                editingKey={editingKey}
                setEditingKey={setEditingKey}
                setDraftValues={setDraftValues}
                onSave={onSave}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assign modal (inside review) ────────────────────────────────────────────
function InlineAssignModal({ suggestion, teamMembers, onConfirm, onClose }: any) {
  const [form, setForm] = useState({ assignedTo: "", deadline: "", priority: suggestion.priority || "Medium" });
  const set = (k: any, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center p-6 backdrop-blur-[6px] bg-[rgba(17,23,22,0.45)]" onClick={onClose}>
      <div className="z-[1101] w-[min(480px,100%)] border border-[rgba(215,239,234,0.9)] rounded-[18px] bg-white shadow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div>
            <p className="text-green text-[10px] font-black uppercase tracking-widest font-montserrat m-0">Assign Task</p>
            <h3 className="m-0 text-sm mt-1 font-extrabold">{suggestion.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center border border-line rounded-lg bg-white hover:bg-surface-soft cursor-pointer"><HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} /></button>
        </div>
        <form className="grid grid-cols-2 gap-3 p-4">
          <label className="grid gap-1">
            <span className="text-[10px] font-black text-muted uppercase">Assign to</span>
            <select value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
              <option value="">Select member</option>
              {teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-black text-muted uppercase">Deadline</span>
            <input type="date" className="form-field w-full min-h-[38px] px-3 border border-line rounded-lg outline-none bg-white text-sm" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-black text-muted uppercase">Priority</span>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
              {["High","Medium","Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => onConfirm(form)} className="flex-1 min-h-[36px] border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">Confirm</button>
            <button type="button" onClick={onClose} className="flex-1 min-h-[36px] border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AiTasksPanel({ meetingTasks, teamMembers, onTaskApprove, onTaskDecline, onTaskUndoDecline, onTaskUpdate, onManualTask }: any) {
  const [assignTarget, setAssignTarget] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [manualForm, setManualForm] = useState({ title: "", description: "", assignedTo: "", deadline: "", priority: "Medium" });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const setM = (k: any, v: any) => setManualForm((f) => ({ ...f, [k]: v }));

  const { suggestions = [], active = [], rejected = [] } = meetingTasks || {};

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Manual create */}
      <div className="flex items-center justify-between">
        <h3 className="m-0">AI Tasks <span className="text-muted font-normal text-sm">for this meeting</span></h3>
        <button type="button" onClick={() => setShowManual((v) => !v)} className="inline-flex items-center gap-1.5 min-h-[30px] px-3 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.5} /> New task
        </button>
      </div>

      {showManual && (
        <form className="grid grid-cols-2 gap-3 p-4 border border-[rgba(46,222,190,0.3)] rounded-xl bg-[rgba(245,255,252,0.7)]" onSubmit={(e) => { e.preventDefault(); onManualTask(manualForm); setManualForm({ title:"", description:"", assignedTo:"", deadline:"", priority:"Medium" }); setShowManual(false); }}>
          <label className="col-span-2 grid gap-1"><span className="text-[10px] font-black text-muted uppercase">Title</span><input required className="form-field w-full min-h-[36px] px-3 border border-line rounded-lg outline-none text-sm bg-white" value={manualForm.title} onChange={(e) => setM("title", e.target.value)} /></label>
          <label className="grid gap-1"><span className="text-[10px] font-black text-muted uppercase">Assign to</span><select value={manualForm.assignedTo} onChange={(e) => setM("assignedTo", e.target.value)}><option value="">Unassigned</option>{teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName}</option>)}</select></label>
          <label className="grid gap-1"><span className="text-[10px] font-black text-muted uppercase">Deadline</span><input type="date" className="form-field w-full min-h-[36px] px-3 border border-line rounded-lg outline-none bg-white text-sm" value={manualForm.deadline} onChange={(e) => setM("deadline", e.target.value)} /></label>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="min-h-[32px] px-4 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">Add</button>
            <button type="button" onClick={() => setShowManual(false)} className="min-h-[32px] px-4 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer">Cancel</button>
          </div>
        </form>
      )}

      {suggestions.length > 0 && (
        <section>
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">AI Suggested ({suggestions.length} pending)</p>
          <div className="grid gap-2">
            {suggestions.map((s: any) => (
              <div key={s.id} className="p-3 border border-[rgba(46,222,190,0.2)] rounded-xl bg-[rgba(245,255,252,0.6)]">
                <div className="flex items-start gap-2 mb-2">
                  <span className={`inline-flex items-center min-h-[18px] px-2 rounded-full border text-[9px] font-black shrink-0 ${(PRIORITY_BADGE as any)[s.priority] || PRIORITY_BADGE.Medium}`}>{s.priority}</span>
                  <p className="m-0 text-sm font-extrabold text-ink flex-1">{s.title}</p>
                </div>
                <p className="m-0 text-xs text-muted leading-[1.5] mb-3">{s.description}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAssignTarget(s)} className="inline-flex items-center gap-1 min-h-[28px] px-3 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} /> Approve
                  </button>
                  <button type="button" onClick={() => onTaskDecline(s)} className="inline-flex items-center gap-1 min-h-[28px] px-3 border border-[rgba(202,78,78,0.35)] rounded-lg bg-white text-red text-xs font-black cursor-pointer">
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Active ({active.length})</p>
        {active.length === 0 ? (
          <div className="grid place-items-center h-16 border border-dashed border-line rounded-xl text-muted text-xs">No active tasks yet</div>
        ) : (
          <div className="grid gap-2">
            {active.map((task: any) => (
              <div key={task.id} className="p-3 border border-line rounded-xl bg-white">
                {editingId === task.id ? (
                  <div className="grid gap-2">
                    <input className="form-field w-full min-h-[34px] px-2 border border-line rounded-lg outline-none text-sm bg-white" value={editDraft.title} onChange={(e) => setEditDraft((d: any) => ({ ...d, title: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={editDraft.assignedTo} onChange={(e) => setEditDraft((d: any) => ({ ...d, assignedTo: e.target.value }))}><option value="">Unassigned</option>{teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName}</option>)}</select>
                      <input type="date" className="form-field px-2 border border-line rounded-lg outline-none text-sm bg-white" value={editDraft.deadline || ""} onChange={(e) => setEditDraft((d: any) => ({ ...d, deadline: e.target.value }))} />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { onTaskUpdate(editDraft); setEditingId(null); }} className="min-h-[28px] px-3 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="min-h-[28px] px-3 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="m-0 text-sm font-extrabold text-ink">{task.title}</p>
                      <p className="m-0 text-[10px] text-muted mt-0.5">{[task.assignedTo, task.deadline].filter(Boolean).join(" · ")}{task.type === "ai" ? " · AI suggested" : " · Manual"}</p>
                    </div>
                    <button type="button" onClick={() => { setEditDraft(task); setEditingId(task.id); }} className="w-7 h-7 grid place-items-center border border-line rounded-lg bg-white hover:bg-surface-soft cursor-pointer"><HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={2} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {rejected.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowRejected((v) => !v)} className="inline-flex items-center gap-1 text-[10px] font-black text-muted uppercase tracking-widest cursor-pointer hover:text-ink">
            <HugeiconsIcon icon={showRejected ? ArrowDown01Icon : ArrowRight01Icon} size={12} strokeWidth={2.5} />
            Declined ({rejected.length})
          </button>
          {showRejected && (
            <div className="grid gap-2 mt-2">
              {rejected.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-line rounded-xl bg-white opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`inline-flex items-center min-h-[16px] px-2 rounded-full border text-[9px] font-black ${(PRIORITY_BADGE as any)[t.priority] || PRIORITY_BADGE.Medium}`}>{t.priority}</span>
                    <p className="m-0 text-xs text-muted line-through flex-1 truncate">{t.title}</p>
                  </div>
                  <button type="button" onClick={() => onTaskUndoDecline(t)} className="inline-flex items-center gap-1 min-h-[24px] px-3 border border-line rounded-lg bg-white text-ink text-[10px] font-black cursor-pointer hover:bg-surface-soft shrink-0">
                    <HugeiconsIcon icon={UndoIcon} size={12} strokeWidth={2} /> Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {assignTarget && (
        <InlineAssignModal suggestion={assignTarget} teamMembers={teamMembers} onConfirm={(data: any) => { onTaskApprove(assignTarget, data); setAssignTarget(null); }} onClose={() => setAssignTarget(null)} />
      )}
    </div>
  );
}


// ─── Main modal ───────────────────────────────────────────────────────────────
export default function ReviewModal({
  selectedMeeting,
  selectedClient,
  rows,
  filledCount,
  missingCount: _missingCount,
  draftValues,
  editingKey,
  setEditingKey,
  setDraftValues,
  onSave,
  onApprove,
  onReject,
  onClose,
  teamMembers,
  meetingTasks,
  onTaskApprove,
  onTaskDecline,
  onTaskUndoDecline,
  onTaskUpdate,
  onManualTask,
  initialActiveTab = "attributes",
}: any) {
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [activeTouchPoint, setActiveTouchPoint] = useState("All");
  const [expandedAccordion, setExpandedAccordion] = useState<any>(null);

  React.useEffect(() => {
    setActiveTab(initialActiveTab);
  }, [initialActiveTab]);

  // Group rows by touch point using the attribute's category
  const grouped: any = {};
  for (const row of rows) {
    const tp = mapCategoryToTouchPoint((row as any).attribute.category);
    if (!grouped[tp]) grouped[tp] = [];
    grouped[tp].push(row);
  }

  const presentTouchPoints = TOUCH_POINTS.filter((tp) => grouped[tp]?.length > 0);
  const sidebarItems = ["All", ...presentTouchPoints];
  const displayedTouchPoints =
    activeTouchPoint === "All" ? presentTouchPoints : [activeTouchPoint];
  const firstTouchPoint = presentTouchPoints[0] ?? null;

  // Auto-expand: the selected section, or the first present one in "All" view
  // (so the panel never opens fully collapsed). Manual toggles still work.
  React.useEffect(() => {
    setExpandedAccordion(activeTouchPoint !== "All" ? activeTouchPoint : firstTouchPoint);
  }, [activeTouchPoint, firstTouchPoint]);

  const fillPct = Math.round((filledCount / Math.max(rows.length, 1)) * 100);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-[10px] bg-[rgba(17,23,22,0.6)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(1140px,100%)] h-[calc(100vh-48px)] flex flex-col border border-[rgba(215,239,234,0.9)] rounded-[20px] bg-white shadow-modal overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-line bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-green text-[10px] font-black uppercase tracking-widest font-montserrat m-0">AI Validation Review</p>
              <h2 id="review-modal-title" className="m-0 text-lg">{selectedMeeting.name}<span className="text-muted font-normal"> — {selectedClient.name}</span></h2>
              <div className="mt-3 inline-flex items-center gap-1 p-1 border border-line rounded-lg bg-[#f9f9f9]">
                <button
                  type="button"
                  onClick={() => setActiveTab("attributes")}
                  className={`min-h-[28px] px-3 rounded-md text-xs font-black cursor-pointer transition-colors ${activeTab === "attributes" ? "bg-white border border-line text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  Attributes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("tasks")}
                  className={`min-h-[28px] px-3 rounded-md text-xs font-black cursor-pointer transition-colors ${activeTab === "tasks" ? "bg-white border border-line text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  AI Tasks {(meetingTasks?.suggestions?.length || 0) > 0 && <span className="ml-1 inline-flex items-center min-h-[14px] px-1.5 rounded-full bg-green text-ink text-[9px] font-black">{meetingTasks.suggestions.length}</span>}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-[140px] h-[6px] rounded-full bg-[#e8f5f0] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green to-[#7de8d0] transition-all duration-500"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              <span className="text-xs font-black text-muted whitespace-nowrap">{fillPct}% filled</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 border border-line rounded-lg bg-white hover:bg-[#f5f5f5] cursor-pointer"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {activeTab === "attributes" ? (
            <>
              {/* Touch point sidebar */}
              <aside className="w-[210px] shrink-0 border-r border-line bg-[#f9fdfb] overflow-y-auto py-3 px-2">
                <p className="px-2 mb-2 text-[9px] font-black text-muted uppercase tracking-[0.12em]">Touch Points</p>
                {sidebarItems.map((tp) => {
                  const isActive = activeTouchPoint === tp;
                  const tpRows = tp === "All" ? rows : (grouped[tp] || []);
                  const tpFilled = tpRows.filter((r: any) => !r.isNull).length;
                  const tpTotal = tpRows.length;
                  const complete = tpFilled === tpTotal && tpTotal > 0;
                  return (
                    <button key={tp} type="button" onClick={() => setActiveTouchPoint(tp)}
                      className={`flex items-center justify-between w-full px-3 py-[7px] rounded-lg mb-[2px] text-left transition-colors duration-100 cursor-pointer ${isActive ? "bg-[rgba(46,222,190,0.14)] text-ink" : "text-muted hover:bg-[rgba(46,222,190,0.06)] hover:text-ink"}`}>
                      <span className="text-xs font-extrabold truncate leading-[1.3]">{tp}</span>
                      {tp !== "All" && <span className={`text-[10px] font-black shrink-0 ml-1 ${complete ? "text-green" : "text-muted"}`}>{tpFilled}/{tpTotal}</span>}
                    </button>
                  );
                })}
              </aside>
              {/* Attribute content */}
              <main className="flex-1 min-w-0 overflow-y-auto p-4 flex flex-col gap-4">
                {displayedTouchPoints.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted text-sm">No attributes in this touch point.</div>
                ) : (
                  displayedTouchPoints.map((tp) => (
                    <TouchPointAccordion key={tp} touchPoint={tp} rows={grouped[tp] || []} draftValues={draftValues}
                      editingKey={editingKey} setEditingKey={setEditingKey} setDraftValues={setDraftValues}
                      onSave={onSave} onApprove={onApprove} onReject={onReject}
                      isOpen={expandedAccordion === tp}
                      onToggle={() => setExpandedAccordion(expandedAccordion === tp ? null : tp)}
                    />
                  ))
                )}
              </main>
            </>
          ) : (
            <div className="flex-1 min-w-0 overflow-y-auto">
              <AiTasksPanel
                meetingTasks={meetingTasks}
                teamMembers={teamMembers || []}
                onTaskApprove={onTaskApprove}
                onTaskDecline={onTaskDecline}
                onTaskUndoDecline={onTaskUndoDecline}
                onTaskUpdate={onTaskUpdate}
                onManualTask={onManualTask}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
