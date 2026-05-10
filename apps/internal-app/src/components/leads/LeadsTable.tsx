import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Linkedin02Icon,
  Mail01Icon,
  UserAccountIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

function confidencePillClass(value = "") {
  const numericValue = Number.parseInt(String(value).replace("%", ""), 10);

  if (numericValue >= 85) {
    return "bg-[#d8fff6] text-[#0f6e5d]";
  }

  if (numericValue >= 70) {
    return "bg-[#fff1c9] text-[#946200]";
  }

  return "bg-[#ffe4e1] text-[#a33a3a]";
}

export default function LeadsTable({ leads, onSelectLead }: any) {
  return (
    <div className="overflow-auto scrollbar-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                Name
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />
                Email
              </div>
            </th>
            <th>Type</th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                KC Taker
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={AiBrain01Icon} size={13} strokeWidth={2.5} />
                Confidence
              </div>
            </th>
            <th>
              <div className="flex items-center gap-1.5 justify-center">
                <HugeiconsIcon icon={Linkedin02Icon} size={13} strokeWidth={2.5} />
                LinkedIn
              </div>
            </th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead: any) => (
            <tr
              key={lead.id}
              className="cursor-pointer transition-colors duration-150 hover:bg-[rgba(46,222,190,0.06)]"
              onClick={() => onSelectLead(lead)}
            >
              <td>
                <button
                  className="block p-0 border-0 bg-transparent text-left cursor-pointer"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLead(lead);
                  }}
                >
                  <strong>{lead.name}</strong>
                </button>
              </td>
              <td>{lead.email}</td>
              <td>{lead.type}</td>
              <td>{lead.kcTakerName}</td>
              <td>
                <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${confidencePillClass(lead.confidence)}`}>
                  {lead.confidence}
                </span>
              </td>
              <td className="text-[#0f6e5d]">
                {lead.linkedin ? (
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Linkedin02Icon} size={14} strokeWidth={2} />
                    <span className="truncate max-w-[120px]">{lead.linkedin}</span>
                  </div>
                ) : (
                  "-"
                )}
              </td>
              <td className="min-w-[240px] text-[#424242] leading-[1.55]">{lead.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
