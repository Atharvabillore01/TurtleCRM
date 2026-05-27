import React from "react";

function formatScheduledAt(value: any) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value || "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDeliveredAt(value: any) {
  if (!value) {
    return "Waiting";
  }

  return formatScheduledAt(value);
}

export default function EmailTrackerModal({ email, onClose }: any) {
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
        aria-labelledby="email-tracker-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[18px] pt-4 pb-[14px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Email Tracker</p>
            <h2 id="email-tracker-modal-title">{email.subject}</h2>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
            type="button"
            onClick={onClose}
            aria-label="Close email dialog"
          >
            {"✕"}
          </button>
        </div>

        <div className="grid gap-4 px-[18px] pt-4 pb-[18px]">
          <div className="grid grid-cols-2 gap-[12px] mobile:grid-cols-1">
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Client</span>
              <strong>{email.clientName}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Client email</span>
              <strong>{email.clientEmail}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Advisor</span>
              <strong>{email.advisorName}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Advisor email</span>
              <strong>{email.advisorEmail}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Scheduled for</span>
              <strong>{formatScheduledAt(email.scheduledAt)}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Delivered at</span>
              <strong>{formatDeliveredAt(email.deliveredAt)}</strong>
            </article>
            <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
              <span className="text-xs font-extrabold text-muted uppercase">Channel</span>
              <strong>{email.channel}</strong>
            </article>
            <article className="col-span-2 grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white mobile:col-span-1">
              <span className="text-xs font-extrabold text-muted uppercase">Preview</span>
              <strong className="leading-[1.6]">{email.preview}</strong>
            </article>
          </div>

          <div className="flex items-center justify-end pt-[6px] border-t border-[rgba(215,239,234,0.9)]">
            <button
              className="min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
