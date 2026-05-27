import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  UserAccountIcon,
  UserGroupIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

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

export default function EmailTrackerTable({ records, onView }: any) {
  if (records.length === 0) {
    return (
      <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
        <strong>No scheduled emails found</strong>
        <span className="text-muted">Try a different search term or filter selection.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[17%]" />
          <col className="w-[13%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[13%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
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
                <HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />
                Subject
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                Advisor
              </div>
            </th>
            <th>Advisor email</th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />
                Scheduled for
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.5} />
                Delivered at
              </div>
            </th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((email: any) => (
            <tr key={email.id}>
              <td className="align-top">
                <strong className="block break-words leading-[1.45]">{email.clientName}</strong>
                <span className="block mt-1 text-muted text-[11px] break-all">{email.clientEmail}</span>
              </td>
              <td className="align-top">
                <strong className="block break-words leading-[1.45]">{email.subject}</strong>
              </td>
              <td className="align-top">{email.advisorName}</td>
              <td className="align-top">
                <span className="block break-all">{email.advisorEmail}</span>
              </td>
              <td className="align-top">{formatScheduledAt(email.scheduledAt)}</td>
              <td className="align-top">{formatDeliveredAt(email.deliveredAt)}</td>
              <td className="align-top">
                <span
                  className={`inline-flex items-center min-h-7 px-2.5 rounded-full text-[11px] font-extrabold ${
                    email.status === "Delivered" ? "bg-[#d8fff6] text-[#0f6e5d]" : "bg-[#eef8f5] text-[#46605a]"
                  }`}
                >
                  {email.status}
                </span>
              </td>
              <td className="align-top">
                <button
                  className="inline-flex items-center gap-1.5 min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                  type="button"
                  onClick={() => onView(email)}
                >
                  <HugeiconsIcon icon={ViewIcon} size={13} strokeWidth={2.5} />
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
