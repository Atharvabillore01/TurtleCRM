import React, { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  UserAccountIcon,
  Calendar01Icon,
} from "@hugeicons/core-free-icons";
import { initialTeamMembers } from "../data/mockData";

const INITIAL_AI_SUGGESTIONS = [
  {
    id: "AIS-001",
    title: "File NRI DTAA documentation for Raj Mehta",
    description: "Client mentioned DTAA filing needed before June deadline. Discussed in meeting on 2026-03-12. Coordinate with tax team to prepare Form 67 and necessary attachments.",
    source: "Raj Financial Planning 1",
    sourceDate: "2026-03-12",
    priority: "High",
  },
  {
    id: "AIS-002",
    title: "Send mutual fund rebalancing proposal to Priya Kapoor",
    description: "Client requested updated portfolio rebalancing after market correction. Equity allocation to be reviewed and proposal sent within 7 days of the session.",
    source: "Priya Q2 Review",
    sourceDate: "2026-04-10",
    priority: "Medium",
  },
  {
    id: "AIS-003",
    title: "Insurance gap analysis follow-up — Arjun Nair",
    description: "Flagged as urgent in meeting notes. Client has no health cover for dependents. Schedule call within 48 hours and present suitable plan options.",
    source: "Arjun NRI Onboarding Call",
    sourceDate: "2026-04-28",
    priority: "High",
  },
];

const PRIORITY_COLORS = {
  High: "bg-[rgba(255,80,80,0.1)] text-red border-[rgba(255,80,80,0.25)]",
  Medium: "bg-[rgba(255,193,87,0.12)] text-[#946200] border-[rgba(255,193,87,0.3)]",
  Low: "bg-[rgba(46,222,190,0.1)] text-[#137765] border-[rgba(46,222,190,0.25)]",
};

function emptyAssignForm() {
  return { assignedTo: "", deadline: "", relatedClient: "", notes: "", priority: "Medium" };
}

function emptyManualForm() {
  return { title: "", description: "", assignedTo: "", deadline: "", priority: "Medium" };
}

// ── Assign modal ──────────────────────────────────────────────────────────────
function AssignModal({ suggestion, teamMembers, onConfirm, onClose }: any) {
  const [form, setForm] = useState({ ...emptyAssignForm(), relatedClient: suggestion.source });
  const set = (k: any, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.55)]" onClick={onClose}>
      <div className="z-[1001] w-[min(560px,100%)] border border-[rgba(215,239,234,0.9)] rounded-[20px] bg-white shadow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line">
          <div>
            <p className="text-green text-[10px] font-black uppercase tracking-widest font-montserrat m-0">Assign Task</p>
            <h2 className="m-0 text-base mt-1">{suggestion.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex items-center justify-center w-8 h-8 border border-line rounded-lg bg-white hover:bg-surface-soft cursor-pointer shrink-0">
            <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2.5} />
          </button>
        </div>

        <form className="grid grid-cols-2 gap-3 p-5" onSubmit={(e) => { e.preventDefault(); onConfirm(form); }}>
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-muted uppercase">Assign to</span>
            <select value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} required>
              <option value="">Select team member</option>
              {teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName} — {m.displayRole}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-muted uppercase">Deadline</span>
            <input type="date" className="form-field w-full min-h-[42px] px-3 border border-line rounded-[10px] outline-none bg-white" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} required />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-muted uppercase">Priority</span>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
              {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-muted uppercase">Related client / meeting</span>
            <input className="form-field w-full min-h-[42px] px-3 border border-line rounded-[10px] outline-none bg-white" value={form.relatedClient} onChange={(e) => set("relatedClient", e.target.value)} />
          </label>
          <label className="col-span-2 grid gap-1.5">
            <span className="text-xs font-extrabold text-muted uppercase">Notes</span>
            <textarea className="form-field w-full px-3 py-2 border border-line rounded-[10px] outline-none bg-white resize-none text-sm" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
          <div className="col-span-2 flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="min-h-[34px] px-4 border border-line rounded-lg bg-white text-ink text-sm font-black cursor-pointer hover:bg-surface-soft">Cancel</button>
            <button type="submit" className="inline-flex items-center gap-2 min-h-[34px] px-4 border border-green rounded-lg bg-green text-ink text-sm font-black cursor-pointer">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} />
              Confirm & assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Editable active task card ─────────────────────────────────────────────────
function ActiveTaskCard({ task, teamMembers, onUpdate }: any) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task);
  const set = (k: any, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  function save() { onUpdate(draft); setEditing(false); }

  return (
    <div className="p-4 border border-line rounded-xl bg-white hover:shadow-sm transition-shadow">
      {editing ? (
        <div className="grid gap-3">
          <input className="form-field w-full min-h-[38px] px-3 border border-line rounded-lg outline-none text-sm font-extrabold bg-white" value={draft.title} onChange={(e) => set("title", e.target.value)} />
          <textarea className="form-field w-full px-3 py-2 border border-line rounded-lg outline-none bg-white resize-none text-sm" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <select value={draft.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
              <option value="">Unassigned</option>
              {teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName}</option>)}
            </select>
            <input type="date" className="form-field px-2 border border-line rounded-lg outline-none text-sm bg-white" value={draft.deadline} onChange={(e) => set("deadline", e.target.value)} />
            <select value={draft.priority} onChange={(e) => set("priority", e.target.value)}>
              {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="min-h-[30px] px-4 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-[30px] px-4 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="m-0 font-extrabold text-sm text-ink">{task.title}</p>
              {task.description && <p className="m-0 mt-1 text-xs text-muted leading-[1.6]">{task.description}</p>}
            </div>
            <button type="button" onClick={() => { setDraft(task); setEditing(true); }} className="flex items-center justify-center w-7 h-7 border border-line rounded-lg bg-white hover:bg-surface-soft cursor-pointer shrink-0">
              <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={2} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {task.priority && (
              <span className={`inline-flex items-center min-h-[20px] px-2 rounded-full border text-[10px] font-black ${(PRIORITY_COLORS as any)[task.priority] || PRIORITY_COLORS.Medium}`}>{task.priority}</span>
            )}
            {task.assignedTo && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <HugeiconsIcon icon={UserAccountIcon} size={11} strokeWidth={2} /> {task.assignedTo}
              </span>
            )}
            {task.deadline && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <HugeiconsIcon icon={Calendar01Icon} size={11} strokeWidth={2} /> {task.deadline}
              </span>
            )}
            {task.source && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted italic">From: {task.source}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AiTasksPage() {
  const teamMembers = initialTeamMembers;

  const [suggestions, setSuggestions] = useState(INITIAL_AI_SUGGESTIONS);
  const [activeTasks, setActiveTasks] = useState<any[]>([]);
  const [rejectedTasks, setRejectedTasks] = useState<any[]>([]);
  const [assignTarget, setAssignTarget] = useState<any>(null); // suggestion being approved
  const [showRejected, setShowRejected] = useState(false);

  // Manual task form
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManualForm);
  const setM = (k: any, v: any) => setManualForm((f) => ({ ...f, [k]: v }));

  function handleApprove(suggestion: any) { setAssignTarget(suggestion); }

  function handleDecline(suggestion: any) {
    setSuggestions((s: any) => s.filter((x: any) => x.id !== suggestion.id));
    setRejectedTasks((r: any) => [...r, { ...suggestion, rejectedAt: new Date().toLocaleDateString("en-IN") }]);
  }

  function handleAssignConfirm(formData: any) {
    setActiveTasks((t: any) => [
      ...t,
      {
        id: `AT-${Date.now()}`,
        title: assignTarget.title,
        description: assignTarget.description,
        source: assignTarget.source,
        assignedTo: formData.assignedTo,
        deadline: formData.deadline,
        priority: formData.priority,
        relatedClient: formData.relatedClient,
        notes: formData.notes,
        type: "ai",
      },
    ]);
    setSuggestions((s: any) => s.filter((x: any) => x.id !== (assignTarget as any).id));
    setAssignTarget(null);
  }

  function handleManualSubmit(e: any) {
    e.preventDefault();
    setActiveTasks((t: any) => [
      ...t,
      { id: `MT-${Date.now()}`, ...manualForm, type: "manual" },
    ]);
    setManualForm(emptyManualForm());
    setShowManual(false);
  }

  function handleUpdateTask(updated: any) {
    setActiveTasks((t) => t.map((x: any) => (x.id === updated.id ? updated : x)));
  }

  return (
    <div className="grid gap-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">AI Tasks</p>
          <h1 className="mt-1 mb-1">AI-generated task queue</h1>
          <p className="text-muted text-sm leading-[1.7] m-0 max-w-[600px]">
            Tasks extracted from meeting transcriptions by the AI model. Review, approve &amp; assign — or create tasks manually.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98] shrink-0"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2.5} />
          New task
        </button>
      </header>

      {/* Manual task form */}
      {showManual && (
        <section className="p-4 border border-[rgba(46,222,190,0.3)] rounded-2xl bg-[rgba(245,255,252,0.8)]">
          <p className="text-green text-xs font-black uppercase font-montserrat m-0 mb-3">Manual task</p>
          <form className="grid grid-cols-2 gap-3" onSubmit={handleManualSubmit}>
            <label className="col-span-2 grid gap-1.5">
              <span className="text-xs font-extrabold text-muted uppercase">Title</span>
              <input required className="form-field w-full min-h-[40px] px-3 border border-line rounded-[10px] outline-none bg-white text-sm" value={manualForm.title} onChange={(e) => setM("title", e.target.value)} placeholder="Task title" />
            </label>
            <label className="col-span-2 grid gap-1.5">
              <span className="text-xs font-extrabold text-muted uppercase">Description</span>
              <textarea className="form-field w-full px-3 py-2 border border-line rounded-[10px] outline-none bg-white resize-none text-sm" rows={2} value={manualForm.description} onChange={(e) => setM("description", e.target.value)} placeholder="Optional details" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-extrabold text-muted uppercase">Assign to</span>
              <select value={manualForm.assignedTo} onChange={(e) => setM("assignedTo", e.target.value)}>
                <option value="">Unassigned</option>
                {teamMembers.map((m: any) => <option key={m.id} value={m.fullName}>{m.fullName}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-extrabold text-muted uppercase">Deadline</span>
              <input type="date" className="form-field w-full min-h-[40px] px-3 border border-line rounded-[10px] outline-none bg-white" value={manualForm.deadline} onChange={(e) => setM("deadline", e.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-extrabold text-muted uppercase">Priority</span>
              <select value={manualForm.priority} onChange={(e) => setM("priority", e.target.value)}>
                {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="min-h-[40px] px-5 border border-green rounded-lg bg-green text-ink text-sm font-black cursor-pointer">Add task</button>
              <button type="button" onClick={() => setShowManual(false)} className="min-h-[40px] px-4 border border-line rounded-lg bg-white text-ink text-sm font-black cursor-pointer">Cancel</button>
            </div>
          </form>
        </section>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.97)] shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <span className="grid w-8 h-8 place-items-center rounded-lg bg-[rgba(46,222,190,0.12)] border border-[rgba(46,222,190,0.2)]">
              <HugeiconsIcon icon={AiBrain01Icon} size={16} strokeWidth={2} className="text-green" />
            </span>
            <div>
              <h2 className="m-0">AI Suggested Tasks</h2>
              <p className="m-0 text-xs text-muted">Extracted from meeting transcriptions — review and approve to assign</p>
            </div>
            <span className="ml-auto inline-flex items-center min-h-[24px] px-3 rounded-full bg-[rgba(46,222,190,0.12)] text-[#137765] text-xs font-black">
              {suggestions.length} pending
            </span>
          </div>

          <div className="grid gap-3">
            {suggestions.map((s: any) => (
              <div key={s.id} className="p-4 border border-[rgba(46,222,190,0.18)] rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.6)] to-white">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center min-h-[18px] px-2 rounded-full border text-[10px] font-black ${(PRIORITY_COLORS as any)[s.priority]}`}>{s.priority}</span>
                      <span className="text-[10px] text-muted italic">From: {s.source} · {s.sourceDate}</span>
                    </div>
                    <p className="m-0 font-extrabold text-sm text-ink">{s.title}</p>
                    <p className="m-0 mt-1 text-xs text-muted leading-[1.6]">{s.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[rgba(215,239,234,0.7)]">
                  <button
                    type="button"
                    onClick={() => handleApprove(s)}
                    className="inline-flex items-center gap-1.5 min-h-[32px] px-4 border border-green rounded-lg bg-green text-ink text-xs font-black cursor-pointer transition-transform active:scale-[0.97]"
                  >
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.5} />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecline(s)}
                    className="inline-flex items-center gap-1.5 min-h-[32px] px-4 border border-[rgba(202,78,78,0.35)] rounded-lg bg-white text-red text-xs font-black cursor-pointer hover:bg-[rgba(202,78,78,0.04)]"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.5} />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active tasks */}
      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.97)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="m-0">Active Tasks</h2>
          <span className="inline-flex items-center min-h-[24px] px-3 rounded-full bg-[rgba(46,222,190,0.12)] text-[#137765] text-xs font-black">{activeTasks.length}</span>
        </div>
        {activeTasks.length === 0 ? (
          <div className="grid place-items-center h-24 border border-dashed border-[rgba(46,222,190,0.3)] rounded-xl text-muted text-sm">
            No active tasks yet — approve an AI suggestion or create one manually.
          </div>
        ) : (
          <div className="grid gap-3">
            {activeTasks.map((task: any) => (
              <ActiveTaskCard key={task.id} task={task} teamMembers={teamMembers} onUpdate={handleUpdateTask} />
            ))}
          </div>
        )}
      </section>

      {/* Rejected tasks */}
      {rejectedTasks.length > 0 && (
        <section className="border border-dashed border-[rgba(180,180,180,0.4)] rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRejected((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-3 bg-[#fafafa] hover:bg-[#f5f5f5] cursor-pointer"
          >
            <span className="text-sm font-black text-[#777]">Declined suggestions ({rejectedTasks.length})</span>
            <HugeiconsIcon icon={showRejected ? Cancel01Icon : Add01Icon} size={14} strokeWidth={2.5} className="text-muted" />
          </button>
          {showRejected && (
            <div className="px-4 pb-4 pt-2 grid gap-2">
              {rejectedTasks.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3 p-3 border border-line rounded-xl bg-white opacity-60">
                  <span className={`inline-flex items-center mt-0.5 min-h-[18px] px-2 rounded-full border text-[10px] font-black ${(PRIORITY_COLORS as any)[t.priority] || PRIORITY_COLORS.Medium}`}>{t.priority}</span>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-sm font-extrabold line-through text-muted">{t.title}</p>
                    <p className="m-0 text-[10px] text-muted">Declined · {t.rejectedAt} · From: {t.source}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Assign modal */}
      {assignTarget && (
        <AssignModal
          suggestion={assignTarget}
          teamMembers={teamMembers}
          onConfirm={handleAssignConfirm}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
