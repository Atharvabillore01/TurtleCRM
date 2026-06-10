import React, { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Archive02Icon,
  Cancel01Icon,
  ComputerVideoIcon,
  RefreshIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import SchedulingTable from "./SchedulingTable";
import SortableTableHeader from "../shared/SortableTableHeader";
import { useTableSort } from "../shared/useTableSort";
import { parseDisplayDateTime } from "../../utils/dateTime";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

function TodaySchedule({ records }: any) {
  const todaySchedule = useMemo(() => {
    const today = new Date();
    const statusOrder = { Upcoming: 0, Completed: 1, Canceled: 2 };

    return records
      .filter((item: any) => {
        const parsed = parseDisplayDateTime(item.datetime);
        return parsed && parsed.getDate() === today.getDate() && parsed.getMonth() === today.getMonth() && parsed.getFullYear() === today.getFullYear();
      })
      .sort((first: any, second: any) => {
        const statusDifference = ((statusOrder as any)[first.status] ?? 99) - ((statusOrder as any)[second.status] ?? 99);
        if (statusDifference !== 0) {
          return statusDifference;
        }
        return (parseDisplayDateTime(first.datetime)?.getTime() ?? 0) - (parseDisplayDateTime(second.datetime)?.getTime() ?? 0);
      });
  }, [records]);

  function cardBg(status: any) {
    if (status === "Completed") return "bg-gradient-to-b from-[#f7fffc] to-[#ebfff8] border-[rgba(46,222,190,0.34)]";
    if (status === "Canceled") return "bg-gradient-to-b from-[#fffafa] to-[#fff0ee] border-[rgba(202,78,78,0.22)]";
    return "bg-gradient-to-b from-[#fcfffe] to-[#f1fbf8] border-line";
  }

  function pillClass(status: any) {
    if (status === "Canceled") return "bg-[#ffe8e5] text-red";
    if (status === "Completed") return "bg-[#d8fff6] text-[#0f6e5d]";
    return "bg-[#eef8f5] text-[#46605a]";
  }

  return (
    <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2>Today's schedule</h2>
          <p className="mt-1 text-muted text-xs m-0">Meetings for today in time sequence</p>
        </div>
        <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
          {todaySchedule.length} meetings today
        </span>
      </div>

      {todaySchedule.length > 0 ? (
        <div className="grid gap-3">
          {todaySchedule.map((item: any) => (
            <article
              className={`grid grid-cols-[140px_minmax(0,1fr)_auto] gap-[18px] items-center p-4 border rounded-[14px] mobile:grid-cols-1 mobile:flex-col ${cardBg(item.status)}`}
              key={item.id}
            >
              <div className="grid content-start gap-1.5 min-h-full pr-[14px] border-r border-[rgba(215,239,234,0.9)] mobile:pr-0 mobile:border-r-0 mobile:border-b mobile:pb-[10px]">
                <strong className="text-[22px] font-comfortaa">
                  {item.datetime.split(" ")[1]} {item.datetime.split(" ")[2]}
                </strong>
                <span className={`inline-flex items-center min-h-7 px-3 rounded-full text-xs font-extrabold ${pillClass(item.status)}`}>
                  {item.status}
                </span>
              </div>
              <div>
                <h3 className="m-0 mb-2 text-xl font-montserrat">{item.title}</h3>
                <p className="m-0 text-muted leading-[1.6]">
                  Member: {item.member} | Advisor: {item.advisor}
                </p>
              </div>
              <div className="flex gap-2 items-center justify-end pl-[14px] border-l border-[rgba(215,239,234,0.9)] mobile:justify-start mobile:pl-0 mobile:border-l-0 mobile:border-t mobile:pt-[10px]">
                <button
                  className="flex justify-center items-center min-w-10 min-h-10 border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
                  type="button"
                  aria-label="Join meeting"
                  title="Join meeting"
                >
                  <HugeiconsIcon icon={ComputerVideoIcon} size={18} strokeWidth={2.5} />
                </button>
                <button
                  className="flex justify-center items-center min-w-10 min-h-10 border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
                  type="button"
                  aria-label="Reschedule meeting"
                  title="Reschedule meeting"
                >
                  <HugeiconsIcon icon={RefreshIcon} size={18} strokeWidth={2.5} />
                </button>
                <button
                  className="flex justify-center items-center min-w-10 min-h-10 border border-[rgba(202,78,78,0.35)] rounded-lg bg-white text-red transition-transform active:scale-95 cursor-pointer hover:bg-[rgba(202,78,78,0.05)]"
                  type="button"
                  aria-label="Cancel meeting"
                  title="Cancel meeting"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2.5} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
          <strong>No meetings scheduled for today</strong>
          <span className="text-muted">Add a new meeting or update an existing record to populate this area.</span>
        </div>
      )}
    </section>
  );
}

export default function SchedulingView({ records, schedulingSearch, setSchedulingSearch, onOpenModal, onCancel, onReschedule }: any) {
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("datetime" as any, "asc");

  const activeRecords = useMemo(() => records.filter((item: any) => item.status !== "Completed" && item.status !== "Canceled"), [records]);

  const sortedRecords = useMemo(
    () =>
      applySort(activeRecords, (item: any, key: any) => {
        if (key === "datetime") {
          return parseDisplayDateTime(item.datetime)?.getTime() ?? 0;
        }

        return item[key];
      }),
    [activeRecords, applySort],
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = schedulingSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return sortedRecords;
    }

    return sortedRecords.filter((item: any) => Object.values(item).some((value: any) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [sortedRecords, schedulingSearch]);

  const pagination = usePagination(filteredRecords, 5, schedulingSearch);

  const total = activeRecords.length;
  const upcoming = activeRecords.filter((item: any) => item.status === "Upcoming").length;

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Scheduling</p>
          <h1>Advisor meeting records</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track all scheduled advisor meetings with ops member ownership, status, quick search, and manual meeting creation.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
          type="button"
          onClick={onOpenModal}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          Add new meeting
        </button>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Active meetings</span>
            <strong className="text-[28px] font-comfortaa">{total}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Upcoming</span>
            <strong className="text-[28px] font-comfortaa">{upcoming}</strong>
          </article>
        </div>
      </section>

      <TodaySchedule records={activeRecords} />

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2>Meeting schedule table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredRecords.length} matching rows</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-[10px] mb-3">
          <label className="flex items-center gap-3 w-[min(100%,560px)] h-10 px-3 border border-line rounded-lg bg-white">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2.5} className="text-green" />
            <input
              className="w-full border-0 outline-none bg-transparent"
              type="search"
              value={schedulingSearch}
              onChange={(event) => setSchedulingSearch(event.target.value)}
              placeholder="Search by title, member, advisor, datetime, or status"
            />
          </label>
        </div>

        <SchedulingTable
          records={pagination.paginatedItems}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          onCancel={onCancel}
          onReschedule={onReschedule}
        />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>
    </div>
  );
}
