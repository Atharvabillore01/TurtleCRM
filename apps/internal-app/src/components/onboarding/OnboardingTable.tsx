import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Edit02Icon,
  Mail01Icon,
  UserAccountIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import SortableTableHeader from "../shared/SortableTableHeader";

export default function OnboardingTable({ prospects, sortKey, sortDirection, onSort }: any) {
  return (
    <div className="overflow-auto border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full min-w-[1120px] border-collapse">
        <thead>
          <tr>
            <SortableTableHeader
              label="Full Name"
              icon={<HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />}
              sortKey="fullName"
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
            <SortableTableHeader label="Phone No." sortKey="phone" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
            <SortableTableHeader
              label="Email"
              icon={<HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />}
              sortKey="email"
              currentSortKey={sortKey}
              sortDirection={sortDirection}
              onSort={onSort}
            />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {prospects.map((prospect: any) => (
            <tr key={prospect.id}>
              <td>
                <strong>{prospect.fullName}</strong>
              </td>
              <td>
                <span
                  className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${
                    prospect.status === "Deadpool"
                      ? "bg-[#ffe8e5] text-red"
                      : "bg-[#d8fff6] text-[#0f6e5d]"
                  }`}
                >
                  {prospect.status}
                </span>
              </td>
              <td>{prospect.phone}</td>
              <td>{prospect.email}</td>
              <td>
                 <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                    type="button"
                  >
                    <HugeiconsIcon icon={ViewIcon} size={13} strokeWidth={2.5} />
                    View
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                    type="button"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={2.5} />
                    Edit
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
