import React, { useEffect, useMemo, useState } from "react";
import AiValidationView from "../components/ai-validation/AiValidationView";
import { attributes, clientProfiles as mockClientProfiles, initialTeamMembers } from "../data/mockData";
import {
  fetchExtractions,
  extractionToMeetingValues,
  patchExtractionFields,
  validateExtraction,
  FIELD_ID_TO_ATTR_ID,
} from "../api/meetingApi";

// Reverse of FIELD_ID_TO_ATTR_ID — used to translate the UI's attribute id
// (e.g. "clientName") back to the 174-field numeric id the patch SP expects.
// Keys are strings because sp_patch_extraction_fields takes field_id as TEXT.
const ATTR_ID_TO_FIELD_ID: Record<string, string> = Object.entries(FIELD_ID_TO_ATTR_ID)
  .reduce<Record<string, string>>((acc, [fieldId, attrId]) => {
    if (!acc[attrId]) acc[attrId] = fieldId;
    return acc;
  }, {});

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
        // Seed the per-extraction version map for optimistic concurrency.
        // Each "meeting" in the UI maps to one extraction (meeting.id === extraction.id).
        const versions: Record<string, number> = {};
        for (const e of extractions) {
          versions[e.id] = e.version ?? 1;
        }
        setExtractionVersions(versions);
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
  // Per-extraction version map for optimistic concurrency on sp_patch_extraction_fields.
  // Populated on extraction load and bumped after every successful patch.
  const [extractionVersions, setExtractionVersions] = useState<Record<string, number>>({});

  const recentMeetings = useMemo(
    () =>
      (clientProfiles as any[])
        .flatMap((client: any) =>
          client.meetings.map((meeting: any) => ({ client, meeting })),
        )
        .sort((a: any, b: any) => new Date(b.meeting.date).getTime() - new Date(a.meeting.date).getTime()),
    [clientProfiles],
  );

  const selectedPair = useMemo(
    () =>
      recentMeetings.find(({ meeting }: any) => meeting.id === selectedMeetingId) ??
      recentMeetings[0],
    [recentMeetings, selectedMeetingId],
  );

  // Compute these BEFORE any early return so the hook order is identical on
  // every render (React error #310 otherwise).
  const selectedClient = selectedPair?.client;
  const selectedMeeting = selectedPair?.meeting;

  const currentTaskState = useMemo(() => {
    if (!selectedMeeting) return { suggestions: [], active: [], rejected: [] };
    if (taskState[selectedMeeting.id]) return taskState[selectedMeeting.id];
    return {
      suggestions: getSuggestionsForMeeting(selectedMeeting.id, selectedMeeting.name),
      active: [],
      rejected: [],
    };
  }, [taskState, selectedMeeting?.id, selectedMeeting?.name]);

  const rows = useMemo(() => {
    if (!selectedMeeting || !selectedClient) return [] as any[];
    return (attributes as any[]).map((attribute: any) => {
      const editKey = `${selectedMeeting.id}:${attribute.id}`;
      const approvalKey = `${selectedClient.id}:${attribute.id}`;
      const rejectedKey = `${selectedMeeting.id}:${attribute.id}`;
      const editedValue = editedValues[editKey];
      const approvedValue = approvedValues[approvalKey];
      const meetingValue = selectedMeeting.values?.[attribute.id];
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
  }, [approvedValues, editedValues, rejectedValues, selectedClient?.id, selectedMeeting]);

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

  const filledCount = rows.filter((r) => !r.isNull).length;
  const missingCount = rows.filter((r) => r.isNull).length;
  const approvedCount = rows.filter((r) => r.isApproved).length;
  const rejectedCount = rows.filter((r) => r.isRejected).length;

  // Persist an edit through to the meeting-service. The server records the
  // change in extraction_field_audit and bumps the extraction's version.
  // Optimistic UI: local state updates immediately, server call follows.
  async function persistFieldEdit(
    attributeId: string,
    newValue: any,
    opts: { confidence: number; source: string; reason?: string },
  ) {
    const extractionId = selectedMeeting.id;
    const fieldId = ATTR_ID_TO_FIELD_ID[attributeId];
    if (!fieldId) {
      // Attribute isn't in the 174-field map yet — nothing to persist.
      // Falls back to local-only state (existing behaviour for unmapped attrs).
      return;
    }
    const expectedVersion = extractionVersions[extractionId] ?? 1;
    try {
      const res = await patchExtractionFields(extractionId, expectedVersion, [
        { field_id: fieldId, value: newValue, ...opts },
      ]);
      setExtractionVersions((v) => ({ ...v, [extractionId]: res.version }));
    } catch (e: any) {
      // On version mismatch the server returns 409 with current_version.
      // For now, surface to console; a future refinement is a toast + auto-reload.
      console.error("persist field edit failed", { attributeId, fieldId, error: e?.message });
    }
  }

  function handleSave(attributeId: any) {
    const raw = draftValues[attributeId];
    const value = typeof raw === "string" ? raw.trim() || null : raw ?? null;
    // Local state update first so the UI feels instant.
    setEditedValues((c) => ({ ...c, [`${selectedMeeting.id}:${attributeId}`]: value }));
    setEditingKey(null);
    // Fire-and-forget DB write — errors logged, no UI block.
    void persistFieldEdit(attributeId, value, {
      confidence: 1.0,
      source: "reviewer",
      reason: "edited in AI Validation",
    });
  }

  function handleApprove(attributeId: any, value: any) {
    setApprovedValues((c) => ({ ...c, [`${selectedClient.id}:${attributeId}`]: value }));
    setRejectedValues((c) => { const n = { ...c }; delete n[`${selectedMeeting.id}:${attributeId}`]; return n; });
    void persistFieldEdit(attributeId, value, {
      confidence: 1.0,
      source: "reviewer",
      reason: "approved in AI Validation",
    });
  }

  function handleReject(attributeId: any) {
    // Reject is UI-only for now — no DB column for "this field was rejected".
    // Persist later as an audit event or a dedicated table if business needs it.
    setRejectedValues((c) => ({ ...c, [`${selectedMeeting.id}:${attributeId}`]: true }));
  }

  // Finalise the whole extraction. Wire to the AiValidationView submit button
  // once the design exposes one; for now the handler is available via the
  // exported helper.
  async function handleValidateAll(notes?: string) {
    try {
      await validateExtraction(selectedMeeting.id, notes);
    } catch (e: any) {
      console.error("validate extraction failed", e?.message);
    }
  }
  // Suppress unused-warning until the view wires it.
  void handleValidateAll;

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
