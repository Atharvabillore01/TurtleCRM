import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, PencilEdit02Icon, Cancel01Icon, Add01Icon, CheckmarkCircle02Icon, Task01Icon } from "@hugeicons/core-free-icons";
import { formatIsoDate, parseIsoDate } from "../../utils/dateTime";
import { clientProfiles, initialMeetings, initialTags } from "../../data/mockData";
import { getClientMilestoneProgress, getMilestonePresets, getVisibleTaskCount, saveClientMilestoneProgress } from "../../utils/milestones";

const tabOptions = [
  { id: "summary", label: "Summary View" },
  { id: "frd", label: "FRD" },
  { id: "meetings", label: "Meetings" },
  { id: "internalNotes", label: "Internal Notes" },
  { id: "financialInfo", label: "Financial Info" },
  { id: "generalInfo", label: "General Info" },
];

function buildMeetingSummary(meeting: any, transcriptRecord: any) {
  const transcript = transcriptRecord?.transcript || "";
  const keyPoints = [];

  if (meeting.status) {
    keyPoints.push(`Status: ${meeting.status}`);
  }

  if (meeting.advisorName) {
    keyPoints.push(`Advisor: ${meeting.advisorName}`);
  }

  if (meeting.issue) {
    keyPoints.push(`Open issue: ${meeting.issue}`);
  }

  if (transcript) {
    keyPoints.push(transcript);
  }

  return keyPoints.join(". ");
}

function shiftIsoDate(value: any, days: any) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return value || "";
  }

  const next = new Date(parsed);
  next.setDate(next.getDate() + days);

  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function getRiskProfile(clientType: any, assignedTo: any) {
  if (clientType === "NRI") {
    return "Aggressive";
  }

  return assignedTo === "Maya" || assignedTo === "Nisha" ? "Balanced" : "Active";
}

function buildDetails(client: any) {
  const advisorList = client.assignedAdvisors || [client.assignedTo, "Operations Desk", "Tax Desk"].filter(Boolean);
  const tags = client.tags || (client.clientType === "NRI" ? ["NRI", "Priority"] : ["Renewal Watch"]);
  const pendingTasks = client.pendingTasks ?? (client.subscriptionStatus === "Deadpool" ? 0 : 2);
  const overdueTasks = client.overdueTasks ?? (client.subscriptionStatus === "Expired Membership" ? 1 : 0);

  return {
    availability: client.availability || "After 7 AM - 4 PM",
    returnDate: client.returnDate || shiftIsoDate(client.subscriptionDate, 210),
    rnorDate: client.rnorDate || shiftIsoDate(client.subscriptionDate, 420),
    riskProfile: client.riskProfile || getRiskProfile(client.clientType, client.assignedTo),
    lifecycleState: client.lifecycleState || (client.subscriptionStatus === "Active Membership" ? "Active" : client.subscriptionStatus),
    membershipExpiry: client.membershipExpiry || shiftIsoDate(client.subscriptionDate, 365),
    assignedAdvisors: advisorList,
    tags,
    pendingTasks,
    overdueTasks,
    clientBio:
      client.clientBio ||
      `${client.fullName} is a ${client.clientType.toLowerCase()} client currently handled by ${client.assignedTo}. The account is being tracked through the membership dashboard with a focus on subscription continuity, service readiness, and active follow-up.`,
    importantNotes:
      client.importantNotes ||
      `Subscription status is ${client.subscriptionStatus.toLowerCase()}. Keep ${client.assignedTo} aligned on the next renewal milestone and recent member communication.`,
    frdSummary:
      client.frdSummary ||
      "FRD checklist is available for review. Service scope, renewal readiness, and current member relationship status are captured here.",
    meetingNotes:
      client.meetingNotes ||
      "Recent meeting notes will appear here. Use this tab to keep discovery context, follow-up decisions, and member commitments in one place.",
    internalNotes:
      client.internalNotes ||
      "Internal coordination notes, ops updates, and escalation context can be tracked here for the servicing team.",
    internalNotesList:
      client.internalNotesList || [
        {
          id: `${client.id}-note-1`,
          title: "Client servicing handoff",
          addedBy: client.assignedTo || "Operations Desk",
          createdAt: client.subscriptionDate,
          points: [
            "Confirm next renewal follow-up timeline with the assigned owner.",
            "Keep advisory and operations aligned on pending deliverables.",
            "Track any open issue before the next client touchpoint.",
          ],
        },
      ],
    financialInfo:
      client.financialInfo ||
      "Financial information can include service scope, account categories, renewal-linked deliverables, and planning areas owned by the advisory team.",
    generalInfo:
      client.generalInfo ||
      "General information can include geography, servicing preferences, communication windows, and other non-financial account context.",
  };
}

function pillClass(text: any) {
  if (text === "Aggressive") {
    return "bg-[rgba(46,222,190,0.14)] text-[#137765]";
  }

  if (text === "Active") {
    return "bg-[rgba(46,222,190,0.14)] text-[#137765]";
  }

  return "bg-[#eef2f7] text-[#5f6676]";
}

function MetricCard({ label, value, children, compact = false }: any) {
  return (
    <article className={`grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white ${compact ? "min-h-[120px]" : ""}`}>
      <span className="text-xs font-extrabold text-muted uppercase">{label}</span>
      {value ? <strong className="leading-[1.5]">{value}</strong> : children}
    </article>
  );
}

function getMilestoneTone(state: any) {
  if (state === "done") {
    return "border-[rgba(46,222,190,0.28)] bg-[rgba(46,222,190,0.08)] text-[#137765]";
  }

  if (state === "current") {
    return "border-[#1d1d1d] bg-[#1d1d1d] text-white shadow-[0_12px_28px_rgba(29,29,29,0.12)]";
  }

  return "border-line bg-white text-muted";
}

export default function ClientsModal({ client, onClose }: any) {
  const [activeTab, setActiveTab] = useState("summary");
  const [selectedMeetingAction, setSelectedMeetingAction] = useState<any>(null);
  const [notes, setNotes] = useState(() => buildDetails(client).internalNotesList);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({
    title: "",
    points: ["", "", ""],
  });
  const details = useMemo(() => buildDetails(client), [client]);
  const [clientTags, setClientTags] = useState(details.tags);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
  const [milestonePresets, setMilestonePresets] = useState(() => getMilestonePresets());
  const [clientMilestoneProgress, setClientMilestoneProgress] = useState(() => getClientMilestoneProgress(client, getMilestonePresets()));

  useEffect(() => {
    const presets = getMilestonePresets();
    setMilestonePresets(presets);
    setClientMilestoneProgress(getClientMilestoneProgress(client, presets));
  }, [client]);

  useEffect(() => {
    if (!clientMilestoneProgress) {
      return;
    }

    saveClientMilestoneProgress(client.id, clientMilestoneProgress);
  }, [client.id, clientMilestoneProgress]);

  const allAvailableTags = useMemo(() => {
    const saved = localStorage.getItem("turtle_tags");
    return saved ? JSON.parse(saved) : initialTags;
  }, []);

  const toggleTag = (tag: any) => {
    const isAdding = !clientTags.includes(tag);
    setClientTags((prev: any) =>
      isAdding
        ? [...prev, tag]
        : prev.filter((t: any) => t !== tag)
    );
    toast.success(isAdding ? `Tag "${tag}" added` : `Tag "${tag}" removed`);
  };
  const clientMeetings = useMemo(() => {
    const profile = clientProfiles.find((item) => item.name === client.fullName);
    const profileMeetings = profile?.meetings || [];

    return initialMeetings
      .filter((meeting) => meeting.clientName === client.fullName)
      .map((meeting) => {
        const transcriptRecord =
          profileMeetings.find((item) => item.name === meeting.eventName || item.date === meeting.startDate) || null;

        return {
          ...meeting,
          transcript: transcriptRecord?.transcript || "No Fireflies transcription available for this meeting yet.",
          aiSummary: buildMeetingSummary(meeting, transcriptRecord),
        };
      });
  }, [client.fullName]);

  const activeMilestoneIndex = clientMilestoneProgress?.activeMilestoneIndex || 0;
  const selectedMilestoneIndex = clientMilestoneProgress?.selectedMilestoneIndex ?? activeMilestoneIndex;
  const activeMilestone = milestonePresets[activeMilestoneIndex] || null;
  const selectedMilestone = milestonePresets[selectedMilestoneIndex] || activeMilestone || null;
  const selectedMilestoneTaskIds = clientMilestoneProgress?.taskProgressByMilestone?.[selectedMilestone?.id] || [];
  const activeMilestoneTaskIds = clientMilestoneProgress?.taskProgressByMilestone?.[activeMilestone?.id] || [];
  const activeMilestoneTasks = activeMilestone?.tasks || [];
  const selectedMilestoneTasks = selectedMilestone?.tasks || [];
  const visibleTaskCount = getVisibleTaskCount(selectedMilestoneTasks, selectedMilestoneTaskIds);
  const visibleTasks = selectedMilestoneTasks.slice(0, visibleTaskCount);
  const activeMilestoneCompletedCount = activeMilestoneTasks.filter((task: any) => activeMilestoneTaskIds.includes(task.id)).length;
  const isActiveMilestoneComplete = activeMilestoneTasks.length > 0 && activeMilestoneCompletedCount === activeMilestoneTasks.length;
  const currentTask = visibleTasks.find((task: any) => !selectedMilestoneTaskIds.includes(task.id)) || null;
  const nextTask = selectedMilestoneTasks.find((task: any) => !selectedMilestoneTaskIds.includes(task.id) && task.id !== currentTask?.id) || null;
  const completedTasks = selectedMilestoneTasks.filter((task: any) => selectedMilestoneTaskIds.includes(task.id));
  const selectedMilestoneCompletedCount = selectedMilestoneTasks.filter((task: any) => selectedMilestoneTaskIds.includes(task.id)).length;
  const milestoneProgressPercent = activeMilestoneTasks.length
    ? Math.round((activeMilestoneCompletedCount / activeMilestoneTasks.length) * 100)
    : 0;
  const latestMeeting = clientMeetings[0] || null;

  function handleMilestoneViewChange(nextIndex: any) {
    setClientMilestoneProgress((current: any) => ({
      ...current,
      selectedMilestoneIndex: Number(nextIndex),
    }));
  }

  function handleActiveMilestoneChange(nextIndex: any) {
    setClientMilestoneProgress((current: any) => ({
      ...current,
      activeMilestoneIndex: Number(nextIndex),
      selectedMilestoneIndex: Number(nextIndex),
      taskProgressByMilestone: {
        ...(current.taskProgressByMilestone || {}),
        [milestonePresets[Number(nextIndex)]?.id || "default"]:
          current.taskProgressByMilestone?.[milestonePresets[Number(nextIndex)]?.id || "default"] || [],
      },
    }));
    toast.success("Client milestone updated");
  }

  function handleTaskToggle(taskId: any, checked: any) {
    setClientMilestoneProgress((current: any) => {
      const milestoneId = selectedMilestone?.id || "default";
      const currentCompletedTaskIds = current.taskProgressByMilestone?.[milestoneId] || [];
      const nextCompletedTaskIds = checked
        ? Array.from(new Set([...currentCompletedTaskIds, taskId]))
        : currentCompletedTaskIds.filter((id: any) => id !== taskId);

      return {
        ...current,
        taskProgressByMilestone: {
          ...(current.taskProgressByMilestone || {}),
          [milestoneId]: nextCompletedTaskIds,
        },
      };
    });
  }

  function moveToNextMilestone() {
    if (!activeMilestone) {
      return;
    }

    const nextIndex = activeMilestoneIndex + 1;

    if (nextIndex >= milestonePresets.length) {
      toast.success("All milestones completed for this client");
      return;
    }

    setClientMilestoneProgress((current: any) => ({
      ...current,
      activeMilestoneIndex: nextIndex,
      selectedMilestoneIndex: nextIndex,
      taskProgressByMilestone: {
        ...(current.taskProgressByMilestone || {}),
        [milestonePresets[nextIndex]?.id || "default"]:
          current.taskProgressByMilestone?.[milestonePresets[nextIndex]?.id || "default"] || [],
      },
    }));
    toast.success("Moved to the next milestone");
  }

  function updateNotePoint(index: any, value: any) {
    setNoteForm((current: any) => ({
      ...current,
      points: current.points.map((point: any, pointIndex: any) => (pointIndex === index ? value : point)),
    }));
  }

  function removeNotePoint(index: any) {
    setNoteForm((current: any) => {
      if (current.points.length === 1) {
        return {
          ...current,
          points: [""],
        };
      }

      return {
        ...current,
        points: current.points.filter((_: any, pointIndex: any) => pointIndex !== index),
      };
    });
  }

  function addNotePoint() {
    setNoteForm((current: any) => ({
      ...current,
      points: [...current.points, ""],
    }));
  }

  function resetNoteForm() {
    setNoteForm({
      title: "",
      points: ["", "", ""],
    });
  }

  function handleSaveNote() {
    const sanitizedPoints = noteForm.points.map((point: any) => point.trim()).filter(Boolean);
    const title = noteForm.title.trim();

    if (!title || sanitizedPoints.length === 0) {
      return;
    }

    setNotes((current: any) => [
      {
        id: `${client.id}-note-${Date.now()}`,
        title,
        addedBy: client.assignedTo || "Operations Desk",
        createdAt: new Date().toISOString().slice(0, 10),
        points: sanitizedPoints,
      },
      ...current,
    ]);

    resetNoteForm();
    setIsAddNoteOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(1120px,100%)] max-h-[calc(100vh-32px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] px-5 pt-5 pb-4 border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.94)] backdrop-blur-[12px]">
          <div className="flex items-start justify-between gap-4 mobile:flex-col mobile:items-start">
            <div className="grid gap-3">
              <div>
                <p className="text-green text-xs font-black uppercase font-montserrat m-0">Clients</p>
                <h2 id="client-modal-title">{client.fullName}</h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="grid gap-1 min-w-[150px]">
                  <span className="text-[11px] font-black uppercase text-muted">Email</span>
                  <strong className="break-all">{client.email}</strong>
                </div>
                <div className="grid gap-1 min-w-[120px]">
                  <span className="text-[11px] font-black uppercase text-muted">Availability</span>
                  <strong>{details.availability}</strong>
                </div>
                <div className="grid gap-1 min-w-[120px]">
                  <span className="text-[11px] font-black uppercase text-muted">Return</span>
                  <strong>{formatIsoDate(details.returnDate)}</strong>
                </div>
                <div className="grid gap-1 min-w-[120px]">
                  <span className="text-[11px] font-black uppercase text-muted">RNOR</span>
                  <strong>{formatIsoDate(details.rnorDate)}</strong>
                </div>
                <div className="flex items-end gap-2">
                  <span className={`inline-flex items-center min-h-8 px-3 rounded-full text-xs font-black ${pillClass(details.riskProfile)}`}>
                    {details.riskProfile}
                  </span>
                  <span className={`inline-flex items-center min-h-8 px-3 rounded-full text-xs font-black ${pillClass(details.lifecycleState)}`}>
                    {details.lifecycleState}
                  </span>
                </div>
              </div>
            </div>

            <button
              className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
              type="button"
              onClick={onClose}
              aria-label="Close client dialog"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4 p-2 rounded-2xl bg-[rgba(246,249,252,0.95)] border border-[rgba(215,239,234,0.9)]">
            {tabOptions.map((tab) => {
              const isActive = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-10 px-4 rounded-xl border text-sm font-black font-montserrat transition-colors duration-150 ${
                    isActive
                      ? "border-[rgba(46,222,190,0.3)] bg-white text-ink shadow-[inset_0_-3px_0_#2edebe]"
                      : "border-transparent bg-transparent text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 px-5 pt-5 pb-5">
          {activeTab === "summary" && (
            <>
              <div className="grid grid-cols-[minmax(180px,0.9fr)_minmax(260px,1.4fr)_minmax(220px,1.2fr)_minmax(140px,0.8fr)] gap-4 xl:grid-cols-2 mobile:grid-cols-1">
                <MetricCard label="Membership expiry" value={formatIsoDate(details.membershipExpiry)} compact />

                <MetricCard label={`Advisors assigned (${details.assignedAdvisors.length})`} compact>
                  <div className="flex flex-wrap gap-2">
                    {details.assignedAdvisors.map((advisor: any) => (
                      <span
                        key={advisor}
                        className="inline-flex items-center min-h-7 px-3 rounded-full bg-[#eef2f7] text-[#51596b] text-[11px] font-black"
                      >
                        {advisor}
                      </span>
                    ))}
                  </div>
                </MetricCard>

                <MetricCard 
                  label={
                    <div className="flex items-center justify-between w-full">
                      <span>Tags ({clientTags.length})</span>
                      <button 
                        onClick={() => setIsTagSelectorOpen(!isTagSelectorOpen)}
                        className="p-1 hover:bg-surface-soft rounded-lg text-green transition-colors"
                      >
                        <HugeiconsIcon icon={Add01Icon} size={16} />
                      </button>
                    </div>
                  } 
                  compact
                >
                  <div className="relative">
                    {clientTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {clientTags.map((tag: any) => (
                          <span
                            key={tag}
                            className="inline-flex items-center min-h-7 px-3 rounded-full bg-[rgba(255,241,201,0.82)] text-[#946200] text-[11px] font-black group relative"
                          >
                            {tag}
                            <button
                              onClick={() => toggleTag(tag)}
                              className="ml-1 opacity-0 group-hover:opacity-100 text-red hover:scale-110 transition-all"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <strong>No tags</strong>
                    )}

                    {isTagSelectorOpen && (
                      <div className="absolute top-full left-0 mt-2 w-56 p-2 bg-white border border-line rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-[10px] font-black uppercase text-muted">Select Tags</span>
                          <button onClick={() => setIsTagSelectorOpen(false)}>
                            <HugeiconsIcon icon={Cancel01Icon} size={14} />
                          </button>
                        </div>
                        <div className="grid gap-1">
                          {allAvailableTags.map((tag: any) => (
                            <button
                              key={tag}
                              onClick={() => toggleTag(tag)}
                              className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                clientTags.includes(tag) 
                                  ? "bg-[rgba(46,222,190,0.12)] text-[#137765]" 
                                  : "hover:bg-surface-soft text-ink"
                              }`}
                            >
                              {tag}
                              {clientTags.includes(tag) && <span className="text-green text-lg leading-none">·</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </MetricCard>

                <MetricCard label="Tasks" compact>
                  <div className="grid gap-1">
                    <strong>Pending: {details.pendingTasks}</strong>
                    <strong className="text-[#a33a3a]">Overdue: {details.overdueTasks}</strong>
                  </div>
                </MetricCard>
              </div>

              <section className="grid gap-3 p-5 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)]">
                <div>
                  <h3 className="m-0 mb-2 text-xl">Client Bio</h3>
                  <p className="m-0 text-muted leading-[1.7]">{details.clientBio}</p>
                </div>
              </section>

              <section className="grid gap-3 p-5 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)]">
                <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
                  <h3 className="m-0 text-xl">Important Notes</h3>
                  <button
                    className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                    type="button"
                  >
                    Edit
                  </button>
                </div>
                <ul className="m-0 pl-5 text-muted leading-[1.7]">
                  <li>{details.importantNotes}</li>
                </ul>
              </section>
            </>
          )}

          {activeTab === "frd" && (
            <section className="grid gap-5 p-5 border border-line rounded-[28px] bg-[rgba(255,255,255,0.98)] shadow-card">
              {activeMilestone ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,0.35fr)_3px_minmax(0,1fr)] gap-0">
                    <div className="grid gap-3 self-start pr-6">
                      <div className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted">Milestones / Stages</span>
                        <p className="m-0 text-sm text-muted">Click a milestone to view its tasks on the right.</p>
                      </div>

                      <div className="overflow-hidden border border-[rgba(215,239,234,0.95)] rounded-[24px] bg-white shadow-[0_12px_30px_rgba(17,23,22,0.04)]">
                        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-4 px-5 py-3 border-b border-line bg-[rgba(246,249,252,0.92)] mobile:hidden">
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">Status</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">Milestone</span>
                        </div>

                        <div className="grid">
                          {milestonePresets.map((milestone: any, index: any) => {
                            const isCompletedMilestone = index < activeMilestoneIndex;
                            const isCurrentMilestone = index === activeMilestoneIndex;
                            const isViewingMilestone = index === selectedMilestoneIndex;

                            return (
                              <button
                                key={milestone.id}
                                type="button"
                                onClick={() => handleMilestoneViewChange(index)}
                                className={`grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-4 px-5 py-4 border-b border-line text-left transition-all duration-150 last:border-b-0 mobile:grid-cols-1 mobile:gap-3 ${
                                  isViewingMilestone
                                    ? "bg-[rgba(255,247,227,0.95)]"
                                    : isCompletedMilestone
                                      ? "bg-[rgba(245,255,252,0.82)]"
                                      : "bg-white hover:bg-[rgba(246,249,252,0.9)]"
                                }`}
                              >
                                <span className={`inline-flex items-center justify-center min-h-[28px] px-3 rounded-full text-[10px] font-black uppercase tracking-[0.08em] ${
                                  isCurrentMilestone
                                    ? "bg-[rgba(255,204,94,0.34)] text-[#946200]"
                                    : isCompletedMilestone
                                      ? "bg-[rgba(46,222,190,0.18)] text-[#137765]"
                                      : "bg-[#eef2f7] text-[#5f6676]"
                                }`}>
                                  {isCurrentMilestone ? "Current" : isCompletedMilestone ? "Completed" : "Pending"}
                                </span>

                                <div className="grid gap-1 min-w-0">
                                  <div className="flex items-center justify-between gap-3">
                                    <strong className="text-[15px] leading-[1.35] text-ink">{`${index + 1}. ${milestone.title}`}</strong>
                                    <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${isViewingMilestone ? "text-[#946200]" : "text-muted"}`}>
                                      {isViewingMilestone ? "Viewing" : "Open"}
                                    </span>
                                  </div>
                                  <span className="text-sm text-muted leading-[1.55]">
                                    {milestone.description || "No description added for this milestone."}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[rgba(46,222,190,0.3)] rounded-full"></div>

                    <div className="grid gap-3 self-start pl-6">
                      <div className="grid gap-1">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#137765]">Tasks Related to Selected Milestone</span>
                        <strong className="text-[18px] leading-[1.35]">{selectedMilestone.title}</strong>
                        <p className="m-0 text-sm text-muted leading-[1.6]">
                          {selectedMilestone.description || "No description added for this milestone."}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
                        <span className="inline-flex items-center min-h-[28px] px-3 rounded-full bg-[rgba(46,222,190,0.08)] text-[#137765] text-xs font-black border border-[rgba(46,222,190,0.24)]">
                          {selectedMilestoneCompletedCount} / {selectedMilestoneTasks.length} tasks completed
                        </span>
                        {selectedMilestoneIndex === activeMilestoneIndex && isActiveMilestoneComplete && (
                          <button
                            type="button"
                            onClick={moveToNextMilestone}
                            className="inline-flex items-center gap-2 min-h-[38px] px-4 border border-green rounded-xl bg-green text-ink text-sm font-black cursor-pointer"
                          >
                            Next milestone
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3">
                        {visibleTasks.map((task: any, index: any) => {
                          const isCompleted = selectedMilestoneTaskIds.includes(task.id);

                          return (
                            <label
                              key={task.id}
                              className={`grid gap-2 p-4 border rounded-[22px] transition-colors ${
                                isCompleted
                                  ? "border-[rgba(46,222,190,0.28)] bg-[rgba(233,252,247,0.96)]"
                                  : "border-[rgba(215,239,234,0.95)] bg-white"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isCompleted}
                                  onChange={(event) => handleTaskToggle(task.id, event.target.checked)}
                                  className="mt-1"
                                />
                                <div className="grid gap-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <HugeiconsIcon
                                      icon={isCompleted ? CheckmarkCircle02Icon : Task01Icon}
                                      size={14}
                                      strokeWidth={2.2}
                                    />
                                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted">Task {index + 1}</span>
                                  </div>
                                  <strong className={`text-[15px] leading-[1.45] ${isCompleted ? "line-through text-muted" : "text-ink"}`}>{task.title}</strong>
                                  <p className="m-0 text-xs text-muted leading-[1.55]">
                                    {isCompleted
                                      ? "Completed. The next task is now available."
                                      : index === visibleTasks.length - 1 && visibleTaskCount < selectedMilestoneTasks.length
                                        ? "Complete this task to unlock the next one."
                                        : "This task is ready for completion."}
                                  </p>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {visibleTasks.length === 0 && (
                        <div className="grid gap-1 p-4 border border-dashed border-line rounded-[18px] bg-[rgba(246,249,252,0.72)]">
                          <strong>No tasks in this milestone</strong>
                          <span className="text-sm text-muted">Add tasks from the Manage Milestones module.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
                  <strong>No milestone preset found</strong>
                  <span className="text-muted">Create milestone presets from the Manage Milestones module.</span>
                </div>
              )}
            </section>
          )}

          {activeTab === "meetings" && (
            <section className="grid gap-4 p-5 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)]">
              <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
                <div>
                  <h3 className="m-0 text-xl">Meetings</h3>
                  <p className="m-0 mt-1 text-muted leading-[1.6]">
                    All meeting records for this client with transcript and AI summary actions.
                  </p>
                </div>
                <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
                  {clientMeetings.length} records
                </span>
              </div>

              {clientMeetings.length > 0 ? (
                <div className="grid gap-3">
                  {clientMeetings.map((meeting: any) => (
                    <article
                      key={meeting.id}
                      className="grid gap-3 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white"
                    >
                      <div className="flex items-start justify-between gap-3 mobile:flex-col mobile:items-start">
                        <div className="grid gap-1">
                          <strong className="text-base">{meeting.eventName}</strong>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                            <span>{formatIsoDate(meeting.startDate)}</span>
                            <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${pillClass(meeting.status)}`}>
                              {meeting.status}
                            </span>
                            <span>Advisor: {meeting.advisorName}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            className="flex items-center justify-center min-w-[34px] min-h-[34px] px-2 border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft transition-colors"
                            type="button"
                            onClick={() =>
                              setSelectedMeetingAction({
                                meetingId: meeting.id,
                                mode: "transcript",
                              })
                            }
                            aria-label="View transcript"
                          >
                            <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={2} />
                          </button>
                          <button
                            className="flex items-center justify-center min-w-[34px] min-h-[34px] px-2 border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft transition-colors"
                            type="button"
                            onClick={() =>
                              setSelectedMeetingAction({
                                meetingId: meeting.id,
                                mode: "summary",
                              })
                            }
                            aria-label="Edit summary"
                          >
                            <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={2} />
                          </button>
                        </div>
                      </div>

                      {meeting.issue ? <p className="m-0 text-sm text-[#a33a3a]">Issue: {meeting.issue}</p> : null}

                      {selectedMeetingAction?.meetingId === meeting.id && (
                        <div className="grid gap-2 p-4 border border-[rgba(46,222,190,0.26)] rounded-xl bg-[rgba(245,255,252,0.72)]">
                          <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
                            <strong>
                              {(selectedMeetingAction as any)?.mode === "transcript" ? "Fireflies transcription" : "AI summary"}
                            </strong>
                            <button
                              className="inline-flex items-center gap-1.5 min-h-[28px] px-2.5 border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                              type="button"
                              onClick={() => setSelectedMeetingAction(null)}
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2.5} /> Close
                            </button>
                          </div>
                          <p className="m-0 text-muted leading-[1.7]">
                            {(selectedMeetingAction as any)?.mode === "transcript" ? meeting.transcript : meeting.aiSummary}
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
                  <strong>No meetings found</strong>
                  <span className="text-muted">This client does not have any meeting records yet.</span>
                </div>
              )}
            </section>
          )}

          {activeTab === "internalNotes" && (
            <section className="grid gap-4 p-5 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)]">
              <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
                <div>
                  <h3 className="m-0 text-xl">Internal Notes</h3>
                  <p className="m-0 mt-1 text-muted leading-[1.6]">
                    Internal coordination notes, ops context, and follow-up points for this client.
                  </p>
                </div>
                <button
                  className="min-h-[34px] px-3 border border-green rounded-lg bg-green text-ink text-xs font-black font-montserrat cursor-pointer"
                  type="button"
                  onClick={() => setIsAddNoteOpen(true)}
                >
                  Add Note
                </button>
              </div>

              {notes.length > 0 ? (
                <div className="grid gap-3">
                  {notes.map((note: any) => (
                    <article
                      key={note.id}
                      className="grid gap-3 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white"
                    >
                      <div className="flex items-start justify-between gap-3 mobile:flex-col mobile:items-start">
                        <div className="grid gap-1">
                          <strong className="text-base">{note.title}</strong>
                          <div className="flex flex-wrap gap-2 text-sm text-muted">
                            <span>Added by: {note.addedBy}</span>
                            <span>{formatIsoDate(note.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <ul className="m-0 pl-5 text-muted leading-[1.7]">
                        {note.points.map((point: any, index: any) => (
                          <li key={`${note.id}-${index}`}>{point}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
                  <strong>No internal notes yet</strong>
                  <span className="text-muted">Add a note to capture internal updates for this client.</span>
                </div>
              )}
            </section>
          )}

          {activeTab === "financialInfo" && (
            <section className="grid gap-4 xl:grid-cols-2">
              <MetricCard label="Financial Info">
                <p className="m-0 text-muted leading-[1.7]">{details.financialInfo}</p>
              </MetricCard>
              <MetricCard label="Subscription Snapshot">
                <div className="grid gap-2">
                  <strong>Status: {client.subscriptionStatus}</strong>
                  <strong>Client type: {client.clientType}</strong>
                  <strong>Subscription date: {formatIsoDate(client.subscriptionDate)}</strong>
                </div>
              </MetricCard>
            </section>
          )}

          {activeTab === "generalInfo" && (
            <section className="grid gap-4 xl:grid-cols-2">
              <MetricCard label="General Info">
                <p className="m-0 text-muted leading-[1.7]">{details.generalInfo}</p>
              </MetricCard>
              <MetricCard label="Contact Info">
                <div className="grid gap-2">
                  <strong>Email: {client.email}</strong>
                  <strong>Phone: {client.phoneNumber}</strong>
                  <strong>Assigned to: {client.assignedTo}</strong>
                </div>
              </MetricCard>
            </section>
          )}
        </div>

        {isAddNoteOpen && (
          <div
            className="fixed inset-0 z-[1002] grid place-items-center p-6 backdrop-blur-[8px] bg-[rgba(17,23,22,0.36)]"
            role="presentation"
            onClick={() => {
              setIsAddNoteOpen(false);
              resetNoteForm();
            }}
          >
            <div
              className="w-[min(640px,100%)] border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Add internal note"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[rgba(215,239,234,0.9)]">
                <h3 className="m-0 text-[32px] leading-none">Add Note</h3>
                <button
                  className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
                  type="button"
                  onClick={() => {
                    setIsAddNoteOpen(false);
                    resetNoteForm();
                  }}
                  aria-label="Close add note dialog"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
                </button>
              </div>

              <div className="grid gap-5 px-6 py-6">
                <label className="grid gap-2">
                  <span className="text-sm font-black text-ink">Title *</span>
                  <input
                    className="form-field w-full min-h-[44px] px-4 py-3 border border-line rounded-[12px] outline-none bg-white"
                    type="text"
                    value={noteForm.title}
                    onChange={(event) => setNoteForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="e.g. Tax Planning Discussion"
                  />
                </label>

                <div className="grid gap-3">
                  <span className="text-sm font-black text-ink">Note *</span>
                  {noteForm.points.map((point: any, index: any) => (
                    <div key={`note-point-${index}`} className="flex items-center gap-3">
                      <input
                        className="form-field w-full min-h-[44px] px-4 py-3 border border-line rounded-[12px] outline-none bg-white"
                        type="text"
                        value={point}
                        onChange={(event) => updateNotePoint(index, event.target.value)}
                        placeholder={`Point ${index + 1}`}
                      />
                      <button
                        className="flex items-center justify-center min-w-[34px] min-h-[34px] border border-line rounded-xl bg-white hover:bg-[#ffecec] text-[#d28d8d] transition-colors cursor-pointer"
                        type="button"
                        onClick={() => removeNotePoint(index)}
                        aria-label={`Remove point ${index + 1}`}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}

                  <button
                    className="inline-flex items-center gap-1.5 justify-self-start min-h-[38px] px-4 border border-dashed border-[rgba(98,118,255,0.35)] rounded-xl bg-[rgba(98,118,255,0.04)] hover:bg-[rgba(98,118,255,0.1)] text-[#6f6adf] text-sm font-black font-montserrat cursor-pointer transition-colors"
                    type="button"
                    onClick={addNotePoint}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2.5} /> Add another point
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-6 py-5 border-t border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.96)]">
                <button
                  className="min-h-[40px] px-5 border border-line rounded-lg bg-white text-ink font-black cursor-pointer"
                  type="button"
                  onClick={() => {
                    setIsAddNoteOpen(false);
                    resetNoteForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="min-h-[40px] px-5 border border-[#6ca5ff] rounded-lg bg-[#6ca5ff] text-white font-black cursor-pointer"
                  type="button"
                  onClick={handleSaveNote}
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
