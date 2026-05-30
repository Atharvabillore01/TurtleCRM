import React, { useMemo } from "react";
import { initials } from "../../utils/formatters";

/**
 * Sidebar grouped by client. Each client shows once with their unvalidated
 * meetings listed beneath. Selecting a meeting still drives the right pane.
 *
 * Props.meetings shape (unchanged from before): [{ client, meeting }, ...]
 */
export default function RecentMeetingRail({
  meetings,
  selectedMeetingId,
  onSelectMeeting,
}: any) {
  const groups = useMemo(() => {
    const map = new Map<string, { client: any; meetings: any[] }>();
    for (const { client, meeting } of meetings) {
      const key = client.id ?? client.name;
      if (!map.has(key)) map.set(key, { client, meetings: [] });
      map.get(key)!.meetings.push(meeting);
    }
    return Array.from(map.values());
  }, [meetings]);

  const totalMeetings = meetings.length;

  return (
    <section
      className="p-[14px] border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card"
      aria-label="Clients with unvalidated meetings"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2>Clients to review</h2>
          <p className="mt-1 text-muted text-xs m-0">
            {groups.length} {groups.length === 1 ? "client" : "clients"} ·{" "}
            {totalMeetings} unvalidated {totalMeetings === 1 ? "meeting" : "meetings"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 max-h-[calc(100vh-190px)] overflow-auto tablet:max-h-none">
        {groups.map(({ client, meetings: clientMeetings }) => (
          <div key={client.id ?? client.name} className="grid gap-1.5">
            {/* Client header */}
            <div className="flex items-center gap-2 px-1 pt-1">
              <span className="grid w-7 h-7 flex-none place-items-center rounded-md bg-[#d8fff6] text-ink text-[10px] font-black font-montserrat">
                {initials(client.name)}
              </span>
              <div className="grid min-w-0">
                <strong className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                  {client.name}
                </strong>
                <span className="text-[11px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                  Advisor: {client.advisor} · {clientMeetings.length}{" "}
                  {clientMeetings.length === 1 ? "meeting" : "meetings"}
                </span>
              </div>
            </div>

            {/* Meetings under this client */}
            <div className="grid gap-1.5 pl-2 border-l-2 border-line ml-3">
              {clientMeetings.map((meeting: any) => {
                const isSelected = selectedMeetingId === meeting.id;
                return (
                  <button
                    type="button"
                    key={meeting.id}
                    onClick={() => onSelectMeeting(meeting.id)}
                    className={`grid items-start w-full min-h-[50px] gap-1 p-2.5 border rounded-lg text-left cursor-pointer transition ${
                      isSelected
                        ? "border-green bg-[#1d1d1d] text-white"
                        : "border-line bg-gradient-to-b from-white to-surface-soft text-ink hover:border-[rgba(46,222,190,0.45)]"
                    }`}
                  >
                    <strong className="text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                      {meeting.name}
                    </strong>
                    <span
                      className={`text-[11px] overflow-hidden text-ellipsis whitespace-nowrap ${
                        isSelected ? "text-[rgba(255,255,255,0.72)]" : "text-muted"
                      }`}
                    >
                      {meeting.date || "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
