import React, { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { formatIsoDate } from "../../utils/dateTime";

const statusOptions = ["Pending", "In Progress", "Blocked", "Completed"];

function toDraft(task: any) {
  if (!task) {
    return {
      client: "",
      assignedTo: "",
      advisor: "",
      title: "",
      description: "",
      createdAt: "",
      dueDate: "",
      status: "Pending",
      scope: "",
    };
  }

  return {
    client: task.client || "",
    assignedTo: task.assignedTo || "",
    advisor: (task.advisors || []).join(", "),
    title: task.title || "",
    description: task.description || "",
    createdAt: task.createdAt || "",
    dueDate: task.dueDate || "",
    status: task.status || "Pending",
    scope: task.scope || "",
  };
}

export default function TasksModal({ mode, task, onClose, onCreate, onSave }: any) {
  const [draft, setDraft] = useState(() => toDraft(task));

  useEffect(() => {
    setDraft(toDraft(task));
  }, [task, mode]);

  const heading = mode === "create" ? "Create internal task" : mode === "edit" ? "Edit task" : "Task details";
  const cta = mode === "create" ? "Create task" : mode === "edit" ? "Save changes" : "Close";

  const taskStatus = useMemo(() => {
    if (!task) {
      return draft.status;
    }

    if (task.status === "Completed") {
      return "Completed";
    }

    return task.isOverdue ? "Overdue" : task.status;
  }, [draft.status, task]);

  function handleSubmit(event: any) {
    event.preventDefault();

    if (mode === "view") {
      onClose();
      return;
    }

    const payload = {
      ...(task || {}),
      ...draft,
      advisors: draft.advisor ? [draft.advisor] : [],
    };

    if (mode === "create") {
      onCreate(payload);
      return;
    }

    onSave(payload);
  }

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(760px,100%)] max-h-[calc(100vh-32px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[22px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[18px] pt-4 pb-[14px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Tasks</p>
            <h2 id="task-modal-title">{heading}</h2>
            <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
              {mode === "create"
                ? "Create a new internal task with the key ownership details and due date."
                : mode === "edit"
                  ? "Update the task details and keep the row aligned with the list, search, and tab filters."
                  : "Review the task fields before jumping back to the table."}
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={onClose}
            aria-label="Close task dialog"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
          </button>
        </div>

        {mode === "view" ? (
          <div className="grid gap-4 px-[18px] pt-4 pb-[18px]">
            <div className="grid grid-cols-2 gap-[14px] mobile:grid-cols-1">
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Client</span>
                <strong>{task.client}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Assigned to</span>
                <strong>{task.assignedTo}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Title</span>
                <strong>{task.title}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Description</span>
                <strong className="leading-[1.6]">{task.description || "No description added."}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Scope</span>
                <strong>{task.scope}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Created at</span>
                <strong>{formatIsoDate(task.createdAt)}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Due date</span>
                <strong>{formatIsoDate(task.dueDate)}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Status</span>
                <strong>{taskStatus}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Advisors</span>
                <strong>{(task.advisors || []).join(", ")}</strong>
              </article>
            </div>

            <div className="flex items-center justify-end gap-3 pt-[6px] border-t border-[rgba(215,239,234,0.9)]">
              <button
                className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                type="button"
                onClick={onClose}
              >
                {cta}
              </button>
            </div>
          </div>
        ) : (
          <form className="grid grid-cols-2 gap-[12px] px-[18px] pt-4 pb-[18px] mobile:grid-cols-1" onSubmit={handleSubmit}>
            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Client</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.client}
                onChange={(event) => setDraft((current: any) => ({ ...current, client: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Advisor</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.advisor}
                onChange={(event) => setDraft((current: any) => ({ ...current, advisor: event.target.value }))}
                placeholder="Single advisor"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Assigned to</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.assignedTo}
                onChange={(event) => setDraft((current: any) => ({ ...current, assignedTo: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Due date</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft((current: any) => ({ ...current, dueDate: event.target.value }))}
              />
            </label>

            <label className="col-span-2 grid gap-2 mobile:col-span-1">
              <span className="text-xs font-extrabold text-muted uppercase">Title</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.title}
                onChange={(event) => setDraft((current: any) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="col-span-2 grid gap-2 mobile:col-span-1">
              <span className="text-xs font-extrabold text-muted uppercase">Description</span>
              <textarea
                className="form-field w-full min-h-[96px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.description}
                onChange={(event) => setDraft((current: any) => ({ ...current, description: event.target.value }))}
                rows={4}
                placeholder="Short internal task brief"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Created at</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="date"
                value={draft.createdAt}
                onChange={(event) => setDraft((current: any) => ({ ...current, createdAt: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Scope</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.scope}
                onChange={(event) => setDraft((current: any) => ({ ...current, scope: event.target.value }))}
                placeholder="Internal"
              />
            </label>

            {mode === "edit" && (
              <label className="grid gap-2">
                <span className="text-xs font-extrabold text-muted uppercase">Status</span>
                <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="col-span-2 flex items-center justify-end gap-3 mt-1 pt-[6px] border-t border-[rgba(215,239,234,0.9)] mobile:col-span-1">
              <button
                className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                type="button"
                onClick={onClose}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-1.5 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
                type="submit"
              >
                <HugeiconsIcon
                  icon={mode === "create" ? Task01Icon : CheckmarkCircle02Icon}
                  size={16}
                  strokeWidth={2.5}
                />
                {cta}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
