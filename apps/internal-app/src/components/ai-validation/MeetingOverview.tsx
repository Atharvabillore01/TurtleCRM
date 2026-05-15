import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

export default function MeetingOverview({
  selectedMeeting,
  selectedClient,
  filledCount,
  missingCount,
  approvedCount,
  rejectedCount,
  onStartReview,
}: any) {
  const summaryItems = [
    { label: "Filled attributes", value: filledCount },
    { label: "Missing attributes", value: missingCount },
    { label: "Approved values", value: approvedCount },
    { label: "Rejected values", value: rejectedCount },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4 mobile:flex-col mobile:items-start">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Meeting overview</p>
          <h2>{selectedMeeting.name}</h2>
          <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
            Review {selectedClient.name}'s extracted attributes, scan completion, and then open the focused approval workspace.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98] whitespace-nowrap"
          type="button"
          onClick={onStartReview}
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2.5} />
          Open review
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
        {summaryItems.map((item) => (
          <article
            className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft"
            key={item.label}
          >
            <span className="text-muted text-xs m-0">{item.label}</span>
            <strong className="text-[28px] font-comfortaa">{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="grid gap-[10px] p-4 border border-line rounded-xl bg-[rgba(245,255,252,0.72)]">
        <div className="flex items-center justify-between gap-4 min-h-[34px] pb-[10px] border-b border-[rgba(215,239,234,0.9)] mobile:flex-col mobile:items-start">
          <span className="text-muted text-xs">Meeting date</span>
          <strong>{selectedMeeting.date}</strong>
        </div>
        <div className="flex items-center justify-between gap-4 min-h-[34px] pb-[10px] border-b border-[rgba(215,239,234,0.9)] mobile:flex-col mobile:items-start">
          <span className="text-muted text-xs">Client</span>
          <strong>{selectedClient.name}</strong>
        </div>
        <div className="flex items-center justify-between gap-4 min-h-[34px] pb-[10px] border-b border-[rgba(215,239,234,0.9)] mobile:flex-col mobile:items-start">
          <span className="text-muted text-xs">Advisor</span>
          <strong>{selectedClient.advisor}</strong>
        </div>
        <div className="flex items-center justify-between gap-4 min-h-[34px] mobile:flex-col mobile:items-start">
          <span className="text-muted text-xs">Location</span>
          <strong>{selectedClient.location}</strong>
        </div>
      </div>
    </div>
  );
}
