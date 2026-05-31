import { useMemo } from "react";
import { initials } from "../../utils/formatters";

/**
 * Sidebar grouped by client. Each client shows once with their meetings
 * listed beneath. Selecting a meeting drives the right pane.
 *
 * Props:
 *   meetings:        [{ client, meeting }, ...]   the flat pairs filtered by listFilter
 *   listFilter:      "pending" | "validated" | "all"
 *   setListFilter:   (f) => void
 *   counts:          { pending, validated, all }
 */
export default function RecentMeetingRail({
  meetings,
  selectedMeetingId,
  onSelectMeeting,
  listFilter = "all",
  setListFilter,
  counts = { pending: 0, validated: 0, all: 0 },
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

  const tabs: { key: "pending" | "validated" | "all"; label: string; count: number }[] = [
    { key: "pending",   label: "Pending",   count: counts.pending },
    { key: "validated", label: "Validated", count: counts.validated },
    { key: "all",       label: "All",       count: counts.all },
  ];

  return (
    <section
      className="p-[14px] border border-line rounded-lg bg-[rgba(255,255,255,0.96)] shadow-card"
      aria-label="Clients to review"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2>Clients to review</h2>
          <p className="mt-1 text-muted text-xs m-0">
            {groups.length} {groups.length === 1 ? "client" : "clients"} ·{" "}
            {totalMeetings} {listFilter === "validated" ? "validated" : listFilter === "pending" ? "pending" : "total"}{" "}
            {totalMeetings === 1 ? "meeting" : "meetings"}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      {setListFilter && (
        <div className="flex items-center gap-1 mb-3 p-1 border border-line rounded-lg bg-surface-soft">
          {tabs.map((t) => {
            const active = t.key === listFilter;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setListFilter(t.key)}
                className={`flex-1 min-h-[28px] px-2 rounded-md text-[11px] font-black uppercase tracking-wider transition ${
                  active
                    ? "bg-white text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
                title={`${t.label} extractions`}
              >
                {t.label} <span className="opacity-70">({t.count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-auto tablet:max-h-none">
        {groups.length === 0 && (
          <p className="text-muted text-xs px-1">
            {listFilter === "pending" && "No pending meetings — everything has been validated."}
            {listFilter === "validated" && "No validated meetings yet."}
            {listFilter === "all" && "No extractions yet. Schedule a meeting + let the bot record it."}
          </p>
        )}

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
                const isValidated = !!meeting.validated;
                return (
                  <button
                    type="button"
                    key={meeting.id}
                    onClick={() => onSelectMeeting(meeting.id)}
                    className={`grid grid-cols-[1fr_auto] items-start w-full min-h-[50px] gap-2 p-2.5 border rounded-lg text-left cursor-pointer transition ${
                      isSelected
                        ? "border-green bg-[#1d1d1d] text-white"
                        : "border-line bg-gradient-to-b from-white to-surface-soft text-ink hover:border-[rgba(46,222,190,0.45)]"
                    }`}
                  >
                    <span className="min-w-0">
                      <strong className="block text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                        {meeting.name}
                      </strong>
                      <span
                        className={`block text-[11px] overflow-hidden text-ellipsis whitespace-nowrap ${
                          isSelected ? "text-[rgba(255,255,255,0.72)]" : "text-muted"
                        }`}
                      >
                        {meeting.date || "—"}
                      </span>
                    </span>
                    {isValidated && (
                      <span
                        className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isSelected
                            ? "bg-[rgba(255,255,255,0.18)] text-white"
                            : "bg-[#d8fff6] text-[#0f6e5d]"
                        }`}
                        title="Validated"
                      >
                        🔒
                      </span>
                    )}
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
