import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  ListViewIcon,
  UserAccountIcon,
  UserGroupIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import IconLabelButton from "../shared/IconLabelButton";
import { formatIsoDate } from "../../utils/dateTime";

function pillClass(status: any) {
  if (status === "Completed") return "bg-[#d8fff6] text-[#0f6e5d]";
  if (status === "Overdue") return "bg-[#ffe8e5] text-red";
  if (status === "Blocked") return "bg-[#fff2d8] text-[#8a5b00]";
  return "bg-[#eef8f5] text-[#46605a]";
}

export default function TasksTable({ records, onView, onEdit }: any) {
  if (records.length === 0) {
    return (
      <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
        <strong>No tasks found</strong>
        <span className="text-muted">Try a different tab, search term, or filter selection.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[11%]" />
          <col className="w-[15%]" />
          <col className="w-[20%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserGroupIcon} size={13} strokeWidth={2.5} />
                Client
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                Assigned to
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                Advisors
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={ListViewIcon} size={13} strokeWidth={2.5} />
                Title
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />
                Created at
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />
                Due date
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.5} />
                Status
              </div>
            </th>
            <th>Scope</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((task: any) => (
            <tr key={task.id} className={task.isOverdue ? "bg-[#fff8f6]" : ""}>
              <td className="align-top">
                <strong>{task.client}</strong>
              </td>
              <td className="align-top">{task.assignedTo}</td>
              <td className="align-top">
                <div className="flex flex-wrap gap-1.5">
                  {(task.advisors || []).map((advisor: any) => (
                    <span
                      className="inline-flex items-center min-h-[22px] px-2 rounded-full bg-[rgba(46,222,190,0.12)] text-[#0f6e5d] text-[11px] font-extrabold"
                      key={`${task.id}:${advisor}`}
                    >
                      {advisor}
                    </span>
                  ))}
                </div>
              </td>
              <td className="align-top">
                <strong className="block break-words leading-[1.45]">{task.title}</strong>
              </td>
              <td className="align-top">{formatIsoDate(task.createdAt)}</td>
              <td className="align-top">{formatIsoDate(task.dueDate)}</td>
              <td className="align-top">
                <span className={`inline-flex items-center min-h-7 px-2.5 rounded-full text-[11px] font-extrabold ${pillClass(task.displayStatus)}`}>
                  {task.displayStatus}
                </span>
              </td>
              <td className="align-top">
                <span className="block break-words">{task.scope}</span>
              </td>
              <td className="align-top">
                <div className="flex items-center gap-1 flex-wrap">
                  <IconLabelButton
                    icon={ViewIcon}
                    className="min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer"
                    type="button"
                    onClick={() => onView(task)}
                  >
                    View
                  </IconLabelButton>
                  <IconLabelButton
                    icon={Edit02Icon}
                    className="min-h-[28px] px-[9px] border border-green rounded-lg bg-[#f2fffb] text-[#0f6e5d] text-[11px] font-black font-montserrat cursor-pointer"
                    type="button"
                    onClick={() => onEdit(task)}
                  >
                    Edit
                  </IconLabelButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
