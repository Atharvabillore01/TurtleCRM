import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { formatIsoDate } from "../../utils/dateTime";

function pillClass(status: any) {
  if (status === "Completed") return "bg-[#d8fff6] text-[#0f6e5d]";
  if (status === "Issues") return "bg-[#ffe8e5] text-red";
  return "bg-[#eef8f5] text-[#46605a]";
}

export default function MeetingsModal({ meeting, onClose }: any) {
  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(720px,100%)] max-h-[calc(100vh-32px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[22px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[18px] pt-4 pb-[14px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Meetings</p>
            <h2 id="meeting-modal-title">{meeting.eventName}</h2>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={onClose}
            aria-label="Close meeting dialog"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid gap-4 px-[18px] pt-4 pb-[18px]">
          <div className="grid grid-cols-2 gap-[12px] mobile:grid-cols-1">
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Status</span>
              <strong className={`inline-flex w-fit items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${pillClass(meeting.status)}`}>
                {meeting.status}
              </strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Client</span>
              <strong>{meeting.clientName}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Advisor</span>
              <strong>{meeting.advisorName}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Advisor email</span>
              <strong>{meeting.advisorEmail}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Start date</span>
              <strong>{formatIsoDate(meeting.startDate)}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Issue</span>
              <strong>{meeting.issue || "No issues"}</strong>
            </article>
          </div>

          <div className="flex items-center justify-end pt-[6px] border-t border-[rgba(215,239,234,0.9)]">
            <button
              className="inline-flex items-center gap-1.5 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
              type="button"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
