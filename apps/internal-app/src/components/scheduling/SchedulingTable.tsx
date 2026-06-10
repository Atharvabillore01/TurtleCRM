import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ComputerVideoIcon,
  ListViewIcon,
  RefreshIcon,
  UserAccountIcon,
} from "@hugeicons/core-free-icons";
import SortableTableHeader from "../shared/SortableTableHeader";

export default function SchedulingTable({ records, sortKey, sortDirection, onSort, onCancel, onReschedule }: any) {
  function isTerminal(status: string) {
    return status === "Canceled" || status === "Completed";
  }
  function pillClass(status: any) {
    if (status === "Canceled") return "bg-[#ffe8e5] text-red";
    if (status === "Completed") return "bg-[#eef8f5] text-[#46605a]";
    return "bg-[#d8fff6] text-[#0f6e5d]";
  }

  return (
    <div className="overflow-auto border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full min-w-[1120px] border-collapse">
        <thead>
          <tr>
            <SortableTableHeader
              label="Title"
              icon={<HugeiconsIcon icon={ListViewIcon} size={13} strokeWidth={2.5} />}
              sortKey="title"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Member"
              icon={<HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />}
              sortKey="member"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Advisor"
              icon={<HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />}
              sortKey="advisor"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="DateTime"
              icon={<HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />}
              sortKey="datetime"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Status"
              icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.5} />}
              sortKey="status"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record: any) => (
            <tr key={record.id}>
              <td>
                <strong>{record.title}</strong>
                {(record.clientNames || record.bookedBy) && (
                  <span className="block mt-[5px] text-muted text-xs leading-[1.5]">
                    {[record.clientNames, record.bookedBy ? `Booked by ${record.bookedBy}` : ""].filter(Boolean).join(" | ")}
                  </span>
                )}
              </td>
              <td>{record.member}</td>
              <td>{record.advisor}</td>
              <td>{record.datetime}</td>
              <td>
                <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${pillClass(record.status)}`}>
                  {record.status}
                </span>
              </td>
              <td>
                 <div className="flex items-center gap-1.5 flex-wrap">
                  {record.meetingUrl ? (
                    <a
                      className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
                      href={record.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Join meeting"
                      title={`Join: ${record.meetingUrl}`}
                    >
                      <HugeiconsIcon icon={ComputerVideoIcon} size={14} strokeWidth={2.5} />
                    </a>
                  ) : (
                    <button
                      className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink opacity-40 cursor-not-allowed"
                      type="button"
                      aria-label="No meeting URL"
                      title="No meeting URL available"
                      disabled
                    >
                      <HugeiconsIcon icon={ComputerVideoIcon} size={14} strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    className={`flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 ${isTerminal(record.status) ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-surface-soft"}`}
                    type="button"
                    aria-label="Reschedule meeting"
                    title={isTerminal(record.status) ? `Cannot reschedule a ${record.status.toLowerCase()} meeting` : "Reschedule meeting"}
                    disabled={isTerminal(record.status)}
                    onClick={() => onReschedule && onReschedule(record)}
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={2.5} />
                  </button>
                  <button
                    className={`flex justify-center items-center min-w-[34px] min-h-[30px] border border-[rgba(202,78,78,0.35)] rounded-lg bg-white text-red transition-transform active:scale-95 ${isTerminal(record.status) ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-[rgba(202,78,78,0.05)]"}`}
                    type="button"
                    aria-label="Cancel meeting"
                    title={isTerminal(record.status) ? `Already ${record.status.toLowerCase()}` : "Cancel meeting"}
                    disabled={isTerminal(record.status)}
                    onClick={() => onCancel && onCancel(record)}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
