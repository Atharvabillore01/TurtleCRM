import { initialMilestonePresets } from "../data/mockData";

const PRESETS_KEY = "turtle_milestone_presets";
const PROGRESS_KEY = "turtle_client_milestone_progress";

function clonePresets(presets) {
  return presets.map((milestone, milestoneIndex) => ({
    ...milestone,
    id: milestone.id || `MS-${milestoneIndex + 1}`,
    tasks: (milestone.tasks || []).map((task, taskIndex) => ({
      ...task,
      id: task.id || `${milestone.id || `MS-${milestoneIndex + 1}`}-T${taskIndex + 1}`,
    })),
  }));
}

export function getMilestonePresets() {
  const saved = localStorage.getItem(PRESETS_KEY);

  if (!saved) {
    return clonePresets(initialMilestonePresets);
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? clonePresets(parsed) : clonePresets(initialMilestonePresets);
  } catch {
    return clonePresets(initialMilestonePresets);
  }
}

export function saveMilestonePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(clonePresets(presets)));
}

function getStoredProgress() {
  const saved = localStorage.getItem(PROGRESS_KEY);

  if (!saved) {
    return {};
  }

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function getDefaultMilestoneIndex(client) {
  if (client.subscriptionStatus === "Up for Renewal") {
    return 2;
  }

  if (client.subscriptionStatus === "Expired Membership" || client.subscriptionStatus === "Deadpool") {
    return 3;
  }

  return 0;
}

export function getClientMilestoneProgress(client, presets) {
  const progress = getStoredProgress();
  const savedClientProgress = progress[client.id];
  const maxIndex = Math.max(presets.length - 1, 0);

  if (savedClientProgress) {
    const normalizedProgress = {
      activeMilestoneIndex: Math.min(
        savedClientProgress.activeMilestoneIndex ?? savedClientProgress.milestoneIndex ?? 0,
        maxIndex,
      ),
      selectedMilestoneIndex: Math.min(
        savedClientProgress.selectedMilestoneIndex ?? savedClientProgress.activeMilestoneIndex ?? savedClientProgress.milestoneIndex ?? 0,
        maxIndex,
      ),
      taskProgressByMilestone:
        savedClientProgress.taskProgressByMilestone && typeof savedClientProgress.taskProgressByMilestone === "object"
          ? savedClientProgress.taskProgressByMilestone
          : {
              [presets[Math.min(savedClientProgress.milestoneIndex ?? 0, maxIndex)]?.id || presets[0]?.id || "default"]:
                Array.isArray(savedClientProgress.completedTaskIds) ? savedClientProgress.completedTaskIds : [],
            },
    };

    progress[client.id] = normalizedProgress;
    saveStoredProgress(progress);
    return normalizedProgress;
  }

  const milestoneIndex = Math.min(getDefaultMilestoneIndex(client), maxIndex);
  const initialProgress = {
    activeMilestoneIndex: milestoneIndex,
    selectedMilestoneIndex: milestoneIndex,
    taskProgressByMilestone: {
      [presets[milestoneIndex]?.id || "default"]: [],
    },
  };

  progress[client.id] = initialProgress;
  saveStoredProgress(progress);

  return initialProgress;
}

export function saveClientMilestoneProgress(clientId, clientProgress) {
  const progress = getStoredProgress();
  progress[clientId] = clientProgress;
  saveStoredProgress(progress);
}

export function getVisibleTaskCount(tasks, completedTaskIds) {
  if (!tasks.length) {
    return 0;
  }

  const completedCount = tasks.filter((task) => completedTaskIds.includes(task.id)).length;
  return Math.min(tasks.length, completedCount + 1);
}
