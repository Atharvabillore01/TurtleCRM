import React, { useEffect, useMemo, useState } from "react";
import AiValidationView from "../components/ai-validation/AiValidationView";
import { attributes, clientProfiles as mockClientProfiles, initialTeamMembers } from "../data/mockData";
import {
  fetchExtractions,
  fetchExtraction,
  extractionToMeetingValues,
  patchExtractionFields,
  validateExtraction,
  FIELD_ID_TO_ATTR_ID,
} from "../api/meetingApi";
import { showApiError } from "../utils/showApiError";
import RejectFieldModal from "../components/ai-validation/RejectFieldModal";
import ValidationReasonDialog from "../components/ai-validation/ValidationReasonDialog";
import { unvalidateExtraction } from "../api/meetingApi";

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

type ListFilter = "pending" | "validated" | "all";

export default function AiValidationPage() {
  const [clientProfiles, setClientProfiles] = useState<any[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Default: show ALL extractions (pending + validated). Validated ones are
  // visually locked but still selectable so reviewers can audit them or
  // unvalidate. Toggle changes which slice is rendered in the sidebar.
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [counts, setCounts] = useState<{ pending: number; validated: number; all: number }>({
    pending: 0, validated: 0, all: 0,
  });

  useEffect(() => {
    fetchExtractions()
      .then((extractions) => {
        const all = extractions || [];
        const pendingArr   = all.filter((e: any) => !e.validated);
        const validatedArr = all.filter((e: any) => !!e.validated);
        setCounts({ pending: pendingArr.length, validated: validatedArr.length, all: all.length });

        const pending =
          listFilter === "pending"   ? pendingArr   :
          listFilter === "validated" ? validatedArr :
          /* all */                    all;

        if (pending.length === 0) {
          setClientProfiles([]);
          return;
        }

        // Group extractions by client. Prefer `client_names[0]`; fall back to client_id.
        const byClient = new Map<string, any>();
        for (const e of pending) {
          const clientName =
            (Array.isArray(e.client_names) && e.client_names[0]) ||
            `Client ${(e.client_id || "").slice(0, 6) || "—"}`;
          const advisorName =
            (Array.isArray(e.adviser_names) && e.adviser_names[0]) || "—";
          const key = e.client_id || clientName;

          if (!byClient.has(key)) {
            byClient.set(key, {
              id: key,
              name: clientName,
              segment: "Live",
              location: "—",
              advisor: advisorName,
              meetings: [],
            });
          }
          const profile = byClient.get(key);
          // Per-field values live on the DETAIL endpoint (fn_get_extraction),
          // not the list endpoint. We populate `values` lazily when the user
          // selects this meeting — see the selectedMeetingId effect below.
          profile.meetings.push({
            id: e.id,
            name: e.meeting_title || `Meeting ${e.meeting_id.slice(-6)}`,
            date: (e.meeting_start_time || e.extracted_at || "").slice(0, 10),
            confidence: 0,            // computed after detail-fetch
            totalFields: e.total_fields || 0,
            validated: !!e.validated,
            transcript: "",
            values: {},
          });
        }

        const profiles = Array.from(byClient.values());
        // Most-recent meeting first inside each client.
        for (const p of profiles) {
          p.meetings.sort(
            (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
        }
        setClientProfiles(profiles);

        const versions: Record<string, number> = {};
        for (const e of pending) versions[e.id] = e.version ?? 1;
        setExtractionVersions(versions);

        const firstMeeting = profiles[0]?.meetings?.[0];
        if (firstMeeting) setSelectedMeetingId(firstMeeting.id);
      })
      .catch((err) => {
        setLoadError(err?.message || "Failed to load extractions");
        setClientProfiles([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFilter]);
  // Lazy-load extraction detail when user selects a meeting in the rail.
  // Avoids fetching all 174-field payloads up-front for every pending meeting.
  useEffect(() => {
    if (!selectedMeetingId) return;
    let cancelled = false;
    fetchExtraction(selectedMeetingId)
      .then((detail) => {
        if (cancelled) return;
        // Patch the selected meeting in place with full values + confidence.
        setClientProfiles((profiles: any[]) =>
          profiles.map((p: any) => ({
            ...p,
            meetings: p.meetings.map((m: any) => {
              if (m.id !== selectedMeetingId) return m;
              // Prefer the migration-022 fields[] array (enriched with
              // attribute label + touch_point from field_definitions).
              // Fall back to raw_data dict for any legacy callers.
              const fieldsArr: any[] = Array.isArray(detail.fields)
                ? detail.fields
                : Object.entries(detail.raw_data || {}).map(
                    ([fid, f]: [string, any]) => ({
                      field_id:   Number(fid),
                      attribute:  f?.attribute || `Field ${fid}`,
                      touch_point: f?.touch_point || "Other",
                      value:      f?.value,
                      confidence: f?.confidence,
                      confidence_level: f?.confidence_level,
                      source:     f?.source,
                      agent:      f?.agent,
                    }),
                  );
              const avg = fieldsArr.length
                ? Math.round(
                    (fieldsArr.reduce((s: number, f: any) => s + (f?.confidence ?? 0), 0) /
                      fieldsArr.length) * 100,
                  )
                : 0;
              return {
                ...m,
                confidence: avg,
                validated: !!detail.validated,
                values: extractionToMeetingValues(detail.raw_data),
                // NEW: keep the full enriched fields[] for the new
                // DB-driven row builder below.
                extractedFields: fieldsArr,
                // Migration 027: standalone AdvisoryAgent coaching report.
                callAnalysis: detail.call_analysis ?? null,
              };
            }),
          })),
        );
        // Update version tracker for optimistic concurrency.
        if (typeof detail.version === "number") {
          setExtractionVersions((v) => ({ ...v, [detail.id]: detail.version! }));
        }
      })
      .catch((err) => {
        showApiError(err, "Failed to load meeting fields.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetingId]);

  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [approvedValues, setApprovedValues] = useState<Record<string, any>>({});
  const [rejectedValues, setRejectedValues] = useState<Record<string, any>>({});
  const [draftValues, setDraftValues] = useState<Record<string, any>>({});
  const [editingKey, setEditingKey] = useState<any>(null);
  const [taskState, setTaskState] = useState<Record<string, any>>({});
  // Per-extraction version map for optimistic concurrency on sp_patch_extraction_fields.
  // Populated on extraction load and bumped after every successful patch.
  const [extractionVersions, setExtractionVersions] = useState<Record<string, number>>({});

  // ── Reject + validation lifecycle hooks ───────────────────────────────
  // These useState calls MUST live above the loading / loadError / no-selection
  // early returns below; otherwise the hook order changes between renders and
  // React throws #310. The handlers that use these setters are defined further
  // down (after the early returns) — that's fine; function declarations are
  // not hooks.
  const [rejectTarget, setRejectTarget] = useState<
    | { attributeId: string; attributeLabel: string; currentValue: any }
    | null
  >(null);
  const [validationDialog, setValidationDialog] = useState<
    "validate" | "unvalidate" | null
  >(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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

    // Prefer the DB-driven extractedFields (one row per actually-extracted
    // field, enriched with attribute label + touch_point from
    // field_definitions). Falls back to the legacy mock `attributes` list
    // only when no fields are loaded yet (initial render / no extraction).
    const sourceFields: any[] = (
      Array.isArray(selectedMeeting.extractedFields) && selectedMeeting.extractedFields.length > 0
        ? selectedMeeting.extractedFields
        : []
    ).filter((f: any) => {
      // Hide Y/N fields that came back negative — a bare "N" (or "No") is
      // noise in the review list, treated like an empty value.
      const v = String(f?.value ?? "").trim().toUpperCase();
      return v !== "N" && v !== "NO";
    });

    if (sourceFields.length === 0) {
      // No extracted fields available — render an empty list. The page
      // header still shows "0 filled" but at least we're not pretending
      // to have 121 attributes that were never extracted.
      return [];
    }

    return sourceFields.map((f: any) => {
      const attrId      = `field_${f.field_id}`;
      const editKey     = `${selectedMeeting.id}:${attrId}`;
      const approvalKey = `${selectedClient.id}:${attrId}`;
      const rejectedKey = `${selectedMeeting.id}:${attrId}`;
      const editedValue   = editedValues[editKey];
      const approvedValue = approvedValues[approvalKey];
      const extractedValue = f.value;
      const displayValue = approvedValue ?? editedValue ?? extractedValue ?? null;
      const isNull = displayValue === null || displayValue === "";
      return {
        attribute: {
          id:          attrId,
          label:       f.attribute || `Field ${f.field_id}`,
          category:    f.touch_point || "Other",
          touchPoint:  f.touch_point || "Other",
          field_id:    f.field_id,
        },
        displayValue,
        isNull,
        confidence:       f.confidence,
        confidence_level: f.confidence_level,
        source:           f.source,
        agent:            f.agent,
        isApproved: approvedValue !== undefined,
        isRejected: rejectedValues[rejectedKey] === true,
        readOnly:   !!selectedMeeting.validated,
      };
    });
  }, [approvedValues, editedValues, rejectedValues, selectedClient?.id, selectedMeeting]);

  // Convenience flag — used by view components to render a "Validated" banner
  // and hide editing affordances entirely.
  const isExtractionValidated = !!selectedMeeting?.validated;

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
    // Two attr-id shapes coexist:
    //   - new DB-driven rows: "field_<n>"            → numeric n is the field_id
    //   - legacy mock-attribute rows: "clientName"    → look up via ATTR_ID_TO_FIELD_ID
    let fieldId: string | number | undefined;
    if (typeof attributeId === "string" && attributeId.startsWith("field_")) {
      fieldId = attributeId.slice("field_".length);
    } else {
      fieldId = ATTR_ID_TO_FIELD_ID[attributeId];
    }
    if (!fieldId) {
      return;   // Unmapped attribute — local-only state, no DB write.
    }
    const expectedVersion = extractionVersions[extractionId] ?? 1;
    try {
      const res = await patchExtractionFields(extractionId, expectedVersion, [
        { field_id: fieldId, value: newValue, ...opts },
      ]);
      setExtractionVersions((v) => ({ ...v, [extractionId]: res.version }));
    } catch (e: any) {
      console.error("persist field edit failed", { attributeId, fieldId, error: e?.message });
      showApiError(e, "Failed to save field. Reload to get the latest version.");
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

  // Reject-with-replacement (state hooks declared above with the other useState
  // calls so they sit ABOVE the loading/error early returns). The modal
  // collects a correct value (or "no value available") + audit reason, then
  // patches the field through sp_patch_extraction_fields. extraction_field_audit
  // captures who, when, before/after, and the reviewer-supplied reason.

  function handleReject(attributeId: any) {
    if (selectedMeeting?.validated) return;     // shouldn't reach here — UI is locked
    const attr = (attributes as any[]).find((a: any) => a.id === attributeId);
    const currentValue =
      editedValues[`${selectedMeeting.id}:${attributeId}`] ??
      approvedValues[`${selectedClient.id}:${attributeId}`] ??
      selectedMeeting.values?.[attributeId] ??
      null;
    setRejectTarget({
      attributeId,
      attributeLabel: attr?.label || attributeId,
      currentValue,
    });
  }

  async function submitReject(newValue: any | null, reason: string) {
    if (!rejectTarget) return;
    const { attributeId } = rejectTarget;
    const valueToPersist = newValue === null ? null : newValue;

    // Local state reflects the new value (or null) + marks rejected for UI.
    setEditedValues((c) => ({
      ...c,
      [`${selectedMeeting.id}:${attributeId}`]: valueToPersist,
    }));
    setRejectedValues((c) => ({
      ...c,
      [`${selectedMeeting.id}:${attributeId}`]: true,
    }));
    // Remove any prior approval — the field has been reset.
    setApprovedValues((c) => {
      const next = { ...c };
      delete next[`${selectedClient.id}:${attributeId}`];
      return next;
    });

    await persistFieldEdit(attributeId, valueToPersist, {
      confidence: valueToPersist === null ? 0 : 1.0,
      source: "reviewer",
      reason:
        valueToPersist === null
          ? `rejected — no value available: ${reason}`
          : `rejected — replaced: ${reason}`,
    });

    setRejectTarget(null);
  }

  // ── Validation lifecycle (Phase 2) ─────────────────────────────────────
  // useState declared above with the other hooks. Both validate and unvalidate
  // require a reason (≥5 chars). The dialog collects it, the SP writes an
  // extraction_validation_audit row, and the history banner re-fetches via
  // refreshKey.

  function handleOpenValidate() {
    setValidationDialog("validate");
  }

  function handleOpenUnvalidate() {
    setValidationDialog("unvalidate");
  }

  async function submitValidationTransition(
    reason: string,
    notes: string | undefined,
  ) {
    if (!selectedMeeting || !validationDialog) return;
    const meetingId = selectedMeeting.id;
    try {
      if (validationDialog === "validate") {
        await validateExtraction(meetingId, reason, notes);
      } else {
        await unvalidateExtraction(meetingId, reason, notes);
      }
      // Re-fetch the detail so `validated`, version, and locked rows
      // reflect the new state.
      const fresh = await fetchExtraction(meetingId);
      setClientProfiles((profiles: any[]) =>
        profiles.map((p: any) => ({
          ...p,
          meetings: p.meetings.map((m: any) =>
            m.id !== meetingId
              ? m
              : {
                  ...m,
                  validated: !!fresh.validated,
                  values: extractionToMeetingValues(fresh.raw_data),
                },
          ),
        })),
      );
      if (typeof fresh.version === "number") {
        setExtractionVersions((v) => ({ ...v, [meetingId]: fresh.version! }));
      }
      setHistoryRefreshKey((k) => k + 1);
      setValidationDialog(null);
    } catch (e: any) {
      // Throw so the dialog can show inline error (it expects to await).
      throw e;
    }
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
      isExtractionValidated={isExtractionValidated}
      onValidateAll={handleOpenValidate}
      onUnvalidate={handleOpenUnvalidate}
      historyRefreshKey={historyRefreshKey}
      listFilter={listFilter}
      setListFilter={setListFilter}
      counts={counts}
    >
      <RejectFieldModal
        open={!!rejectTarget}
        attributeLabel={rejectTarget?.attributeLabel || ""}
        currentValue={rejectTarget?.currentValue ?? null}
        onSubmit={submitReject}
        onClose={() => setRejectTarget(null)}
      />
      <ValidationReasonDialog
        open={!!validationDialog}
        mode={validationDialog ?? "validate"}
        onSubmit={submitValidationTransition}
        onClose={() => setValidationDialog(null)}
      />
    </AiValidationView>
  );
}
