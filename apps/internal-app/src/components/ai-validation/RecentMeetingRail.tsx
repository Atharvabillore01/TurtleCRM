import React from "react";
import { initials } from "../../utils/formatters";

export default function RecentMeetingRail({ meetings, selectedMeetingId, onSelectMeeting }: any) {
  return (
    <section
      className="p-[14px] border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card"
      aria-label="Recent meetings"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2>Recent meetings</h2>
          <p className="mt-1 text-muted text-xs m-0">{meetings.length} available transcripts</p>
        </div>
      </div>

      <div className="grid gap-2 max-h-[calc(100vh-190px)] overflow-auto tablet:grid-cols-[repeat(3,minmax(210px,1fr))] tablet:max-h-none tablet:overflow-x-auto mobile:grid-cols-1">
        {meetings.map(({ client, meeting }: any) => (
          <button
            className={`grid grid-cols-[36px_minmax(0,1fr)] items-center w-full min-h-[70px] gap-[10px] p-[10px] border rounded-lg text-left cursor-pointer ${
              selectedMeetingId === meeting.id
                ? "border-green bg-[#1d1d1d] text-white"
                : "border-line bg-gradient-to-b from-white to-surface-soft text-ink shadow-[inset_0_0_0_1px_rgba(46,222,190,0.04)]"
            }`}
            type="button"
            key={meeting.id}
            onClick={() => onSelectMeeting(meeting.id)}
          >
            <span className="grid w-9 h-9 flex-none place-items-center rounded-lg bg-[#d8fff6] text-ink text-xs font-black font-montserrat">
              {initials(client.name)}
            </span>
            <span className="grid min-w-0">
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap">{meeting.name}</strong>
              <span
                className={`overflow-hidden text-ellipsis whitespace-nowrap text-xs ${
                  selectedMeetingId === meeting.id ? "text-[rgba(255,255,255,0.72)]" : "text-muted"
                }`}
              >
                {client.name} | {meeting.date}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
