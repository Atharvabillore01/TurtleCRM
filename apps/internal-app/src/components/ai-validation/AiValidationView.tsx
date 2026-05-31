import React, { useState } from "react";
import RecentMeetingRail from "./RecentMeetingRail";
import MeetingOverview from "./MeetingOverview";
import ReviewModal, { mapCategoryToTouchPoint } from "./ReviewModal";
import ValidationHistoryBanner from "./ValidationHistoryBanner";

export default function AiValidationView({
  recentMeetings,
  selectedMeeting,
  selectedClient,
  selectedMeetingId,
  onSelectMeeting,
  rows,
  filledCount,
  missingCount,
  approvedCount,
  rejectedCount,
  draftValues,
  editingKey,
  setEditingKey,
  setDraftValues,
  onSave,
  onApprove,
  onReject,
  teamMembers,
  meetingTasks,
  onTaskApprove,
  onTaskDecline,
  onTaskUndoDecline,
  onTaskUpdate,
  onManualTask,
  isExtractionValidated = false,
  onValidateAll,
  onUnvalidate,
  historyRefreshKey = 0,
  listFilter = "all",
  setListFilter,
  counts = { pending: 0, validated: 0, all: 0 },
  children,
}: any) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewTab, setReviewTab] = useState("attributes");

  const openReview = (tab = "attributes") => {
    setReviewTab(tab);
    setIsReviewOpen(true);
  };

  // Enrich rows with touch point mapping
  const enrichedRows = (rows as any[]).map((row: any) => ({
    ...row,
    attribute: {
      ...row.attribute,
      touchPoint: mapCategoryToTouchPoint(row.attribute.category),
    },
  }));

  return (
    <>
      <header className="flex items-center justify-between gap-5 mb-[18px] mobile:flex-col mobile:items-start">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">AI Validation</p>
          <h1>Recent meeting review</h1>
        </div>
      </header>

      <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-3 items-start tablet:grid-cols-1">
        <RecentMeetingRail
          meetings={recentMeetings}
          selectedMeetingId={selectedMeetingId}
          onSelectMeeting={onSelectMeeting}
          listFilter={listFilter}
          setListFilter={setListFilter}
          counts={counts}
        />

        <section
          className="min-w-0 p-[14px] border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card"
          aria-label="Meeting workspace"
        >
          <div className="flex items-center justify-between gap-[14px] mb-3 mobile:flex-col mobile:items-start">
            <div>
              <p className="text-green text-xs font-black uppercase font-montserrat m-0">{selectedClient.segment} Client</p>
              <h2>{selectedClient.name}</h2>
              <span className="text-muted text-[13px]">
                Advisor: {selectedClient.advisor} | Location: {selectedClient.location}
              </span>
            </div>
            <div className="flex items-center gap-2 mobile:flex-col mobile:items-stretch">
              {isExtractionValidated ? (
                <>
                  <span
                    className="inline-flex items-center gap-1.5 min-h-[34px] px-3 border border-[rgba(46,222,190,0.45)] rounded-full bg-[#d8fff6] text-[#0f6e5d] text-xs font-extrabold"
                    title="This extraction has been validated and is locked from edits"
                  >
                    <span aria-hidden="true">🔒</span> Validated · locked
                  </span>
                  {onUnvalidate && (
                    <button
                      type="button"
                      onClick={onUnvalidate}
                      className="inline-flex items-center min-h-[34px] px-3 border border-[rgba(202,78,78,0.45)] rounded-lg bg-white text-red text-xs font-black uppercase tracking-wider hover:bg-[rgba(202,78,78,0.06)]"
                      title="Reopen this extraction for editing (audit row will be created)"
                    >
                      ↺ Unvalidate
                    </button>
                  )}
                </>
              ) : (
                onValidateAll && (
                  <button
                    type="button"
                    onClick={onValidateAll}
                    className="inline-flex items-center min-h-[34px] px-4 border border-[#138773] rounded-lg bg-[#138773] text-white text-xs font-black uppercase tracking-wider hover:opacity-90"
                    title="Mark this extraction as reviewed. Locks editing."
                  >
                    ✓ Validate extraction
                  </button>
                )
              )}
            </div>
          </div>

          {/* Validation-history banner — appears once any validate/unvalidate
              event exists for this extraction. Refetches when historyRefreshKey
              changes (i.e. immediately after a successful transition). */}
          {selectedMeeting?.id && (
            <ValidationHistoryBanner
              extractionId={selectedMeeting.id}
              refreshKey={historyRefreshKey}
            />
          )}

          {/* Simple Task Tracker Snapshot */}
          <section className="p-4 border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card min-w-0 mb-4" aria-label="Meeting tasks snapshot">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2>Active Tasks</h2>
                <p className="mt-1 text-muted text-xs m-0">Quick tracker for tasks generated from this meeting</p>
              </div>
              <button
                type="button"
                onClick={() => openReview("tasks")}
                className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98] whitespace-nowrap"
              >
                AI Tasks
              </button>
            </div>
            
            <div className="grid gap-2">
              {!(meetingTasks?.active?.length > 0) ? (
                <div className="flex items-center justify-center h-16 border border-dashed border-line rounded-lg text-muted text-xs">
                  No active tasks. Open review to create some.
                </div>
              ) : (
                meetingTasks.active.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-2.5 border border-line rounded-lg bg-white">
                    <div>
                      <p className="m-0 text-sm font-extrabold text-ink">{t.title}</p>
                      <p className="m-0 text-[10px] text-muted mt-0.5">
                        {[t.assignedTo || "Unassigned", t.deadline].filter(Boolean).join(" · ")}
                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded border border-line bg-surface-soft uppercase tracking-wider">{t.priority}</span>
                      </p>
                    </div>
                    {t.type === "ai" && (
                      <button
                        type="button"
                        onClick={() => openReview("tasks")}
                        className="min-h-[34px] px-3 rounded-lg border border-line bg-surface-soft text-[11px] font-black uppercase tracking-[0.04em] transition hover:bg-surface"
                      >
                        Open preview
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Summary card — always visible */}
          <section
            className="p-4 border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card min-w-0"
            aria-label="Meeting summary"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2>Summary</h2>
                <p className="mt-1 text-muted text-xs m-0">Compact meeting snapshot before opening review</p>
              </div>
            </div>

            <MeetingOverview
              selectedMeeting={selectedMeeting}
              selectedClient={selectedClient}
              filledCount={filledCount}
              missingCount={missingCount}
              approvedCount={approvedCount}
              rejectedCount={rejectedCount}
              onStartReview={() => openReview("attributes")}
            />
          </section>
        </section>
      </div>

      {/* Review modal — opens on "Open review" */}
      {isReviewOpen && (
        <ReviewModal
          key={reviewTab}
          selectedMeeting={selectedMeeting}
          selectedClient={selectedClient}
          rows={enrichedRows}
          filledCount={filledCount}
          missingCount={missingCount}
          draftValues={draftValues}
          editingKey={editingKey}
          setEditingKey={setEditingKey}
          setDraftValues={setDraftValues}
          onSave={onSave}
          onApprove={onApprove}
          onReject={onReject}
          onClose={() => setIsReviewOpen(false)}
          teamMembers={teamMembers}
          meetingTasks={meetingTasks}
          onTaskApprove={onTaskApprove}
          onTaskDecline={onTaskDecline}
          onTaskUndoDecline={onTaskUndoDecline}
          onTaskUpdate={onTaskUpdate}
          onManualTask={onManualTask}
          initialActiveTab={reviewTab}
        />
      )}

      {/* Reject-with-replacement modal lives here so it overlays the workspace */}
      {children}
    </>
  );
}
