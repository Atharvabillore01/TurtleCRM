import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  ListViewIcon,
  Mail01Icon,
  UserAccountIcon,
  UserGroupIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import IconLabelButton from "../shared/IconLabelButton";
import SortableTableHeader from "../shared/SortableTableHeader";
import { formatIsoDate } from "../../utils/dateTime";

function pillClass(status: any) {
  if (status === "Completed") return "bg-[#d8fff6] text-[#0f6e5d]";
  if (status === "Issues") return "bg-[#ffe8e5] text-red";
  return "bg-[#eef8f5] text-[#46605a]";
}

export default function MeetingsTable({ records, onView, sortKey, sortDirection, onSort }: any) {
  if (records.length === 0) {
    return (
      <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
        <strong>No meetings found</strong>
        <span className="text-muted">Try a different tab, search term, or filter selection.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[20%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr>
            <SortableTableHeader
              label="Event name"
              icon={<HugeiconsIcon icon={ListViewIcon} size={13} strokeWidth={2.5} />}
              sortKey="eventName"
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
            <SortableTableHeader
              label="Client name"
              icon={<HugeiconsIcon icon={UserGroupIcon} size={13} strokeWidth={2.5} />}
              sortKey="clientName"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Advisor name"
              icon={<HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />}
              sortKey="advisorName"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Advisor email"
              icon={<HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />}
              sortKey="advisorEmail"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <SortableTableHeader
              label="Start date"
              icon={<HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />}
              sortKey="startDate"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((meeting: any) => (
            <tr key={meeting.id}>
              <td className="align-top">
                <strong className="block break-words leading-[1.45]">{meeting.eventName}</strong>
              </td>
              <td className="align-top">
                <span className={`inline-flex items-center min-h-7 px-2.5 rounded-full text-[11px] font-extrabold ${pillClass(meeting.status)}`}>
                  {meeting.status}
                </span>
              </td>
              <td className="align-top">{meeting.clientName}</td>
              <td className="align-top">{meeting.advisorName}</td>
              <td className="align-top">
                <span className="block break-all">{meeting.advisorEmail}</span>
              </td>
              <td className="align-top">{formatIsoDate(meeting.startDate)}</td>
              <td className="align-top">
                <IconLabelButton
                  icon={ViewIcon}
                  className="min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer"
                  type="button"
                  onClick={() => onView(meeting)}
                >
                  View
                </IconLabelButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
