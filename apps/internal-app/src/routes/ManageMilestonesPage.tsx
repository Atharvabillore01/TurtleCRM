import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  PencilEdit02Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { getMilestonePresets, saveMilestonePresets } from "../utils/milestones";

function createMilestoneDraft() {
  return {
    id: `MS-${Date.now()}`,
    title: "",
    description: "",
    tasks: [{ id: `MS-${Date.now()}-T1`, title: "" }],
  };
}

function createTaskDraft(milestoneId: any, count: any) {
  return {
    id: `${milestoneId}-T${count + 1}-${Date.now()}`,
    title: "",
  };
}

export default function ManageMilestonesPage() {
  const [milestones, setMilestones] = useState(() => getMilestonePresets());
  const [draftMilestone, setDraftMilestone] = useState<any>(null);
  const [editingMilestoneId, setEditingMilestoneId] = useState<any>(null);

  useEffect(() => {
    saveMilestonePresets(milestones);
  }, [milestones]);

  const totalTasks = useMemo(
    () => (milestones as any[]).reduce((sum: any, milestone: any) => sum + milestone.tasks.length, 0),
    [milestones],
  );

  function updateDraftField(field: any, value: any) {
    setDraftMilestone((current: any) => ({ ...current, [field]: value }));
  }

  function updateDraftTask(index: any, value: any) {
    setDraftMilestone((current: any) => ({
      ...current,
      tasks: current.tasks.map((task: any, taskIndex: any) => (taskIndex === index ? { ...task, title: value } : task)),
    }));
  }

  function addDraftTask() {
    setDraftMilestone((current: any) => ({
      ...current,
      tasks: [...current.tasks, createTaskDraft(current.id, current.tasks.length)],
    }));
  }

  function removeDraftTask(index: any) {
    setDraftMilestone((current: any) => ({
      ...current,
      tasks: current.tasks.length === 1 ? current.tasks : current.tasks.filter((_: any, taskIndex: any) => taskIndex !== index),
    }));
  }

  function resetEditor() {
    setDraftMilestone(null);
    setEditingMilestoneId(null);
  }

  function startCreate() {
    setDraftMilestone(createMilestoneDraft());
    setEditingMilestoneId("new");
  }

  function startEdit(milestone: any) {
    setDraftMilestone({
      ...milestone,
      tasks: milestone.tasks.map((task: any) => ({ ...task })),
    });
    setEditingMilestoneId(milestone.id);
  }

  function saveDraft() {
    const title = draftMilestone.title.trim();
    const description = draftMilestone.description.trim();
    const tasks = draftMilestone.tasks.map((task: any) => ({ ...task, title: task.title.trim() })).filter((task: any) => task.title);

    if (!title) {
      toast.error("Milestone title is required");
      return;
    }

    if (tasks.length === 0) {
      toast.error("Add at least one task");
      return;
    }

    const payload = {
      ...draftMilestone,
      title,
      description,
      tasks,
    };

    setMilestones((current: any) => {
      if (editingMilestoneId === "new") {
        return [...current, payload];
      }
      return current.map((milestone: any) => (milestone.id === editingMilestoneId ? payload : milestone));
    });

    resetEditor();
    toast.success(editingMilestoneId === "new" ? "Milestone created" : "Milestone updated");
  }

  function deleteMilestone(milestoneId: any) {
    setMilestones((current: any) => current.filter((milestone: any) => milestone.id !== milestoneId));
    if (editingMilestoneId === milestoneId) {
      resetEditor();
    }
    toast.success("Milestone deleted");
  }

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Manage Milestones</p>
          <h1>Milestone presets</h1>
          <p className="max-w-[760px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Define the milestone flow and the ordered tasks that appear inside the FRD tab for each client.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 min-h-[40px] px-4 border border-green rounded-xl bg-green text-ink text-sm font-black cursor-pointer"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2.5} />
          Add milestone
        </button>
      </header>

      <section className="grid grid-cols-3 gap-4 xl:grid-cols-1">
        <article className="grid gap-2 p-4 border border-line rounded-2xl bg-white shadow-card">
          <span className="text-xs font-extrabold text-muted uppercase">Preset milestones</span>
          <strong className="text-[28px] font-comfortaa">{(milestones as any[]).length}</strong>
        </article>
        <article className="grid gap-2 p-4 border border-line rounded-2xl bg-white shadow-card">
          <span className="text-xs font-extrabold text-muted uppercase">Preset tasks</span>
          <strong className="text-[28px] font-comfortaa">{totalTasks}</strong>
        </article>
        <article className="grid gap-2 p-4 border border-line rounded-2xl bg-white shadow-card">
          <span className="text-xs font-extrabold text-muted uppercase">FRD behavior</span>
          <strong className="leading-[1.5]">Tasks unlock one by one in the active milestone.</strong>
        </article>
      </section>

      {draftMilestone && (
        <section className="grid gap-4 p-5 border border-[rgba(46,222,190,0.28)] rounded-2xl bg-[rgba(245,255,252,0.92)] shadow-card">
          <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
            <div>
              <h2 className="m-0">{editingMilestoneId === "new" ? "Create milestone" : "Edit milestone"}</h2>
              <p className="m-0 mt-1 text-muted text-sm">Add the milestone name, a short description, and its ordered tasks.</p>
            </div>
            <button
              type="button"
              onClick={resetEditor}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
              Cancel
            </button>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Milestone title</span>
              <input
                className="form-field w-full min-h-[44px] px-4 border border-line rounded-xl outline-none bg-white"
                value={draftMilestone.title}
                onChange={(event) => updateDraftField("title", event.target.value)}
                placeholder="e.g. Discovery"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Description</span>
              <textarea
                className="form-field w-full min-h-[88px] px-4 py-3 border border-line rounded-xl outline-none bg-white resize-y"
                value={draftMilestone.description}
                onChange={(event) => updateDraftField("description", event.target.value)}
                placeholder="Short guidance for the team about this milestone."
              />
            </label>

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-extrabold text-muted uppercase">Tasks</span>
                <button
                  type="button"
                  onClick={addDraftTask}
                  className="inline-flex items-center gap-1.5 min-h-[32px] px-3 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer"
                >
                  <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.5} />
                  Add task
                </button>
              </div>

              {draftMilestone.tasks.map((task: any, index: any) => (
                <div key={task.id} className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center min-w-[32px] min-h-[32px] rounded-lg bg-[rgba(46,222,190,0.16)] text-[#137765] text-xs font-black">
                    {index + 1}
                  </span>
                  <input
                    className="form-field w-full min-h-[44px] px-4 border border-line rounded-xl outline-none bg-white"
                    value={task.title}
                    onChange={(event) => updateDraftTask(index, event.target.value)}
                    placeholder={`Task ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftTask(index)}
                    className="flex items-center justify-center min-w-[38px] min-h-[38px] border border-line rounded-xl bg-white text-muted hover:text-red cursor-pointer"
                    aria-label={`Remove task ${index + 1}`}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2.2} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex items-center gap-2 min-h-[40px] px-4 border border-green rounded-xl bg-green text-ink text-sm font-black cursor-pointer"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2.5} />
              Save milestone
            </button>
          </div>
        </section>
      )}

      <section className="grid gap-4">
        {(milestones as any[]).map((milestone: any, milestoneIndex: any) => (
          <article key={milestone.id} className="grid gap-4 p-5 border border-line rounded-2xl bg-white shadow-card">
            <div className="flex items-start justify-between gap-3 mobile:flex-col mobile:items-start">
              <div className="grid gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center min-h-[26px] px-3 rounded-full bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black">
                    Milestone {milestoneIndex + 1}
                  </span>
                  <h2 className="m-0">{milestone.title}</h2>
                </div>
                <p className="m-0 text-muted text-sm leading-[1.6]">
                  {milestone.description || "No description added for this milestone yet."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(milestone)}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-3 border border-line rounded-lg bg-white text-ink text-xs font-black cursor-pointer"
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={2.2} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteMilestone(milestone.id)}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-3 border border-[rgba(202,78,78,0.3)] rounded-lg bg-white text-red text-xs font-black cursor-pointer"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2.2} />
                  Delete
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              {milestone.tasks.map((task: any, taskIndex: any) => (
                <div key={task.id} className="flex items-center gap-3 p-3 border border-line rounded-xl bg-[rgba(248,250,252,0.85)]">
                  <HugeiconsIcon icon={Task01Icon} size={16} strokeWidth={2.2} />
                  <span className="text-xs font-black text-muted uppercase">{taskIndex + 1}</span>
                  <strong>{task.title}</strong>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
