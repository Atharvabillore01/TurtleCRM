import React, { useEffect, useMemo, useState } from "react";
import AiValidationView from "../components/ai-validation/AiValidationView";
import { attributes, clientProfiles as mockClientProfiles, initialTeamMembers } from "../data/mockData";
import { fetchExtractions, extractionToMeetingValues } from "../api/meetingApi";

const MEETING_TASK_SEEDS = {
  default: [
    {
      id: "AIS-A",
      title: "Follow up on action items discussed",
      description: "Review the meeting transcript and send a follow-up email summarising agreed action points to the client.",
      priority: "Medium",
    },
    {
      id: "AIS-B",
      title: "Update client profile with new information",
      description: "AI detected new demographic or financial data during the session. Update the client's profile attributes accordingly.",
      priority: "High",
    },
  ],
};

function getSuggestionsForMeeting(meetingId: any, meetingName: any) {
  const base = MEETING_TASK_SEEDS.default.map((t) => ({
    ...t,
    id: `${t.id}-${meetingId}`,
    source: meetingName,
  }));

  return [
    ...base,
    {
      id: `AIS-C-${meetingId}`,
      title: `Review extracted attributes for ${meetingName}`,
      description: `AI model extracted ${Math.floor(Math.random() * 20) + 5} new or updated fields from the transcript. Validate and approve relevant attributes in the Attributes tab.`,
      priority: "High",
      source: meetingName,
    },
  ];
}

export default function AiValidationPage() {
  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchExtractions()
      .then((extractions) => {
        const first = extractions[0];
        if (!first) {
          setClientProfiles([]);
          return;
        }
        const liveProfile = {
          id: first.client_id,
          name: `Client ${first.client_id}`,
          segment: "Live",
          location: "—",
          advisor: "—",
          meetings: extractions.map((e) => ({
            id: e.id,
            name: `Meeting ${e.meeting_id.slice(-6)}`,
            date: e.extracted_at.slice(0, 10),
            confidence: Math.round(
              Object.values(e.raw_data).reduce((sum, f) => sum + (f.confidence ?? 0), 0) /
                Object.values(e.raw_data).length * 100,
            ),
            transcript: "",
            values: extractionToMeetingValues(e.raw_data),
          })),
        };
        setClientProfiles([liveProfile]);
        if (liveProfile.meetings[0]) {
          setSelectedMeetingId(liveProfile.meetings[0].id);
        }
      })
      .catch((err) => {
        setLoadError(err?.message || "Failed to load extractions");
        setClientProfiles([]);
      })
      .finally(() => setLoading(false));
  }, []);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [approvedValues, setApprovedValues] = useState<Record<string, any>>({});
  const [rejectedValues, setRejectedValues] = useState<Record<string, any>>({});
  const [draftValues, setDraftValues] = useState<Record<string, any>>({});
  const [editingKey, setEditingKey] = useState<any>(null);
  const [taskState, setTaskState] = useState<Record<string, any>>({});

  const recentMeetings = useMemo(
    () =>
      (clientProfiles as any[])
        .flatMap((client: any) =>
          client.meetings.map((meeting: any) => ({ client, meeting })),
        )
        .sort((a: any, b: any) => new Date(b.meeting.date).getTime() - new Date(a.meeting.date).getTime()),
    [],
  );

  const selectedPair = useMemo(
    () =>
      recentMeetings.find(({ meeting }: any) => meeting.id === selectedMeetingId) ??
      recentMeetings[0],
    [recentMeetings, selectedMeetingId],
  );

  // Empty / loading / error states — nothing to render against.
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-500">
        Loading extractions…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Failed to load extractions: {loadError}
      </div>
    );
  }
  if (!selectedPair) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-slate-500 gap-2">
        <h2 className="text-xl font-semibold">No extractions yet</h2>
        <p>Schedule a meeting and let the bot record + transcribe — extractions will show up here.</p>
      </div>
    );
  }

  const selectedClient = selectedPair.client;
  const selectedMeeting = selectedPair.meeting;

  const currentTaskState = useMemo(() => {
    if (taskState[selectedMeeting.id]) return taskState[selectedMeeting.id];
    return {
      suggestions: getSuggestionsForMeeting(selectedMeeting.id, selectedMeeting.name),
      active: [],
      rejected: [],
    };
  }, [taskState, selectedMeeting.id, selectedMeeting.name]);

  function updateTaskState(meetingId: any, updater: any) {
    setTaskState((prev: any) => {
      const current = prev[meetingId] ?? {
        suggestions: getSuggestionsForMeeting(meetingId, selectedMeeting.name),
        active: [],
        rejected: [],
      };
      return { ...prev, [meetingId]: updater(current) };
    });
  }

  function handleTaskApprove(suggestion: any, assignData: any) {
    updateTaskState(selectedMeeting.id, (s: any) => ({
      suggestions: s.suggestions.filter((x: any) => x.id !== suggestion.id),
      active: [...s.active, { ...suggestion, ...assignData, type: "ai" }],
      rejected: s.rejected,
    }));
  }

  function handleTaskDecline(suggestion: any) {
    updateTaskState(selectedMeeting.id, (s: any) => ({
      suggestions: s.suggestions.filter((x: any) => x.id !== suggestion.id),
      active: s.active,
      rejected: [...s.rejected, { ...suggestion, rejectedAt: new Date().toLocaleDateString("en-IN") }],
    }));
  }

  function handleTaskUpdate(updated: any) {
    updateTaskState(selectedMeeting.id, (s: any) => ({
      ...s,
      active: s.active.map((x: any) => (x.id === updated.id ? updated : x)),
    }));
  }

  function handleTaskUndoDecline(suggestion: any) {
    updateTaskState(selectedMeeting.id, (s: any) => ({
      ...s,
      suggestions: [...s.suggestions, suggestion],
      rejected: s.rejected.filter((x: any) => x.id !== suggestion.id),
    }));
  }

  function handleManualTask(task: any) {
    updateTaskState(selectedMeeting.id, (s: any) => ({
      ...s,
      active: [...s.active, { ...task, id: `MT-${Date.now()}`, type: "manual" }],
    }));
  }

  const rows = useMemo(() => {
    return (attributes as any[]).map((attribute: any) => {
      const editKey = `${selectedMeeting.id}:${attribute.id}`;
      const approvalKey = `${selectedClient.id}:${attribute.id}`;
      const rejectedKey = `${selectedMeeting.id}:${attribute.id}`;
      const editedValue = editedValues[editKey];
      const approvedValue = approvedValues[approvalKey];
      const meetingValue = selectedMeeting.values[attribute.id];
      const displayValue = approvedValue ?? editedValue ?? meetingValue ?? null;
      const isNull = displayValue === null || displayValue === "";
      return {
        attribute,
        displayValue,
        isNull,
        isApproved: approvedValue !== undefined,
        isRejected: rejectedValues[rejectedKey] === true,
      };
    });
  }, [approvedValues, editedValues, rejectedValues, selectedClient.id, selectedMeeting]);

  const filledCount = rows.filter((r) => !r.isNull).length;
  const missingCount = rows.filter((r) => r.isNull).length;
  const approvedCount = rows.filter((r) => r.isApproved).length;
  const rejectedCount = rows.filter((r) => r.isRejected).length;

  function handleSave(attributeId: any) {
    setEditedValues((c) => ({ ...c, [`${selectedMeeting.id}:${attributeId}`]: draftValues[attributeId]?.trim() || null }));
    setEditingKey(null);
  }
  function handleApprove(attributeId: any, value: any) {
    setApprovedValues((c) => ({ ...c, [`${selectedClient.id}:${attributeId}`]: value }));
    setRejectedValues((c) => { const n = { ...c }; delete n[`${selectedMeeting.id}:${attributeId}`]; return n; });
  }
  function handleReject(attributeId: any) {
    setRejectedValues((c) => ({ ...c, [`${selectedMeeting.id}:${attributeId}`]: true }));
  }

  return (
    <AiValidationView
      recentMeetings={recentMeetings}
      selectedMeeting={selectedMeeting}
      selectedClient={selectedClient}
      selectedMeetingId={selectedMeeting.id}
      onSelectMeeting={(meetingId: any) => { setSelectedMeetingId(meetingId); setEditingKey(null); }}
      rows={rows}
      filledCount={filledCount}
      missingCount={missingCount}
      approvedCount={approvedCount}
      rejectedCount={rejectedCount}
      draftValues={draftValues}
      editingKey={editingKey}
      setEditingKey={setEditingKey}
      setDraftValues={setDraftValues}
      onSave={handleSave}
      onApprove={handleApprove}
      onReject={handleReject}
      teamMembers={initialTeamMembers}
      meetingTasks={currentTaskState}
      onTaskApprove={handleTaskApprove}
      onTaskDecline={handleTaskDecline}
      onTaskUndoDecline={handleTaskUndoDecline}
      onTaskUpdate={handleTaskUpdate}
      onManualTask={handleManualTask}
    />
  );
}
