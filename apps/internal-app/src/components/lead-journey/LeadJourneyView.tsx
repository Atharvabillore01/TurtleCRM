import React, { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Archive02Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  ListViewIcon,
  Mail01Icon,
  Search01Icon,
  UserAccountIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const stageCards = [
  {
    id: "all",
    label: "All pipeline",
    caption: "Everything together",
    icon: ListViewIcon,
  },
  {
    id: "leads",
    label: "Leads",
    caption: "Not moved yet",
    icon: UserAccountIcon,
  },
  {
    id: "prospects",
    label: "Prospects",
    caption: "In onboarding flow",
    icon: ArrowRight01Icon,
  },
  {
    id: "deadpool",
    label: "Deadpool",
    caption: "Stopped or inactive",
    icon: Archive02Icon,
  },
];

function stagePillClass(stage: any) {
  if (stage === "Dead Prospect") {
    return "border-[rgba(196,196,196,0.9)] bg-[#f7f7f7] text-[#555]";
  }

  if (stage === "Prospect") {
    return "border-[rgba(255,200,87,0.28)] bg-[rgba(255,241,201,0.62)] text-[#946200]";
  }

  if (stage === "Converted") {
    return "border-[rgba(46,222,190,0.24)] bg-[rgba(46,222,190,0.14)] text-[#137765]";
  }

  return "border-[rgba(46,222,190,0.22)] bg-[rgba(46,222,190,0.10)] text-[#137765]";
}

function typePillClass(clientType: any) {
  if (clientType === "NRI") {
    return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#444]";
  }

  if (clientType === "Indian") {
    return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#444]";
  }

  return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#666]";
}

function sourcePillClass(source: any) {
  if (source === "Moved from lead") {
    return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#444]";
  }

  if (source === "Onboarding") {
    return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#444]";
  }

  return "border border-[rgba(196,196,196,0.9)] bg-[#fafafa] text-[#444]";
}

export default function LeadJourneyView({
  records,
  search,
  setSearch,
  onOpenAddLead,
  onSelectLead,
}: any) {
  const [activeStage, setActiveStage] = useState("all");

  const sortedRows = useMemo(
    () =>
      [...records].sort((first: any, second: any) => {
        return first.name.localeCompare(second.name);
      }),
    [records],
  );

  const counts = useMemo(
    () => ({
      all: sortedRows.length,
      leads: sortedRows.filter((row: any) => row.stage === "Lead").length,
      prospects: sortedRows.filter((row: any) => row.stage === "Prospect").length,
      deadpool: sortedRows.filter((row: any) => row.stage === "Dead Prospect").length,
    }),
    [sortedRows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return sortedRows.filter((row: any) => {
      const matchesStage =
        activeStage === "all" ||
        (activeStage === "leads" && row.stage === "Lead") ||
        (activeStage === "prospects" && row.stage === "Prospect") ||
        (activeStage === "deadpool" && row.stage === "Dead Prospect");

      const matchesSearch =
        !normalizedQuery ||
        [row.name, row.email, row.phone, row.clientType, row.owner, row.source, row.status, row.notes]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStage && matchesSearch;
    });
  }, [activeStage, search, sortedRows]);

  const pagination = usePagination(filteredRows, 5, `${activeStage}|${search}`);
  const activeCard: any = stageCards.find((card: any) => card.id === activeStage) || stageCards[0];

  return (
    <div className="grid gap-[18px]">
      <section className="p-5 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
          <div className="max-w-[780px]">
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Lead Journey</p>
            <h1>Lead and onboarding pipeline</h1>
            <p className="max-w-[760px] mt-[10px] mb-0 text-muted text-sm leading-[1.7]">
              One place to track all leads and clearly see whether each one is still a lead, has become a prospect, has gone cold, or is converted.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
              type="button"
              onClick={onOpenAddLead}
            >
              <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
              Add lead
            </button>
          </div>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          {stageCards.map((card: any) => {
            const isActive = activeStage === card.id;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveStage(card.id)}
                className={`grid gap-2 p-4 border rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "border-green bg-[rgba(46,222,190,0.12)] shadow-[0_4px_12px_rgba(46,222,190,0.12)]"
                    : "border-line bg-white hover:border-[rgba(46,222,190,0.32)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted text-xs m-0">{card.label}</span>
                  <HugeiconsIcon
                    icon={card.icon}
                    size={16}
                    strokeWidth={2}
                    className={isActive ? "text-green" : "text-muted opacity-40"}
                  />
                </div>
                <strong className="text-[28px] font-comfortaa">{(counts as any)[card.id]}</strong>
                <span className="text-xs text-muted">{card.caption}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Pipeline table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredRows.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {(counts as any)[activeStage]} in {stageCards.find((card: any) => card.id === activeStage)?.label.toLowerCase()}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 mb-4 mobile:grid-cols-1">
          <label className="flex items-center gap-3 w-full min-h-[44px] px-4 border border-line rounded-xl bg-white">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-[rgba(46,222,190,0.12)] text-[#137765]" aria-hidden="true">
              <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.9} color="currentColor" />
            </span>
            <input
              className="w-full border-0 outline-none bg-transparent"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, type, owner, source..."
            />
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center min-h-[36px] px-3 rounded-xl bg-white border border-line text-xs font-black text-muted">
              {activeCard.label}
            </span>
            <button
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 border border-line rounded-xl bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
              type="button"
              onClick={() => setSearch("")}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
              Clear search
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
            <strong>No pipeline records found</strong>
            <span className="text-muted">Try a different search term or switch to another stage card.</span>
          </div>
        ) : (
          <div className="overflow-auto border border-line rounded-xl bg-white">
            <table className="w-full min-w-[1180px] border-collapse">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
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
                      <HugeiconsIcon icon={FilterIcon} size={13} strokeWidth={2.5} />
                      Stage
                    </div>
                  </th>
                  <th>
                    <div className="flex items-center gap-1.5 justify-center">
                      <HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />
                      Email
                    </div>
                  </th>
                  <th>Phone</th>
                  <th>Client Type</th>
                  <th>Owner</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((row: any) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors duration-150 hover:bg-[rgba(46,222,190,0.04)]"
                    onClick={() => onSelectLead(row)}
                  >
                    <td>
                      <strong>{row.name}</strong>
                      <span>{row.id}</span>
                    </td>
                    <td>
                      <span className={`inline-flex items-center min-h-7 px-3 border rounded-full text-xs font-extrabold ${stagePillClass(row.stage)}`}>
                        {row.stage}
                      </span>
                    </td>
                    <td>
                      <span className="block break-all">{row.email}</span>
                    </td>
                    <td className="text-[#424242]">{row.phone}</td>
                    <td>
                      <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${typePillClass(row.clientType)}`}>
                        {row.clientType}
                      </span>
                    </td>
                    <td>{row.owner}</td>
                    <td>
                      <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${sourcePillClass(row.source)}`}>
                        {row.source}
                      </span>
                    </td>
                    <td className="min-w-[240px] text-[#424242] leading-[1.55]">{row.notes}</td>
                    <td>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="inline-flex items-center gap-2 min-h-[32px] px-3 border border-line rounded-xl bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectLead(row);
                          }}
                        >
                          <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={1.8} color="currentColor" />
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>
    </div>
  );
}
