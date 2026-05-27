import React, { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  Calendar01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  ListViewIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import MeetingsModal from "./MeetingsModal";
import MeetingsTable from "./MeetingsTable";
import SortableTableHeader from "../shared/SortableTableHeader";
import { useTableSort } from "../shared/useTableSort";
import { formatIsoDate } from "../../utils/dateTime";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const tabOptions = [
  { id: "total", label: "Total bookings", icon: ListViewIcon },
  { id: "upcoming", label: "Upcoming", icon: Calendar01Icon },
  { id: "completed", label: "Completed", icon: CheckmarkCircle02Icon },
  { id: "issues", label: "Issues", icon: Alert01Icon },
];

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

export default function MeetingsView({ meetings }: any) {
  const [activeTab, setActiveTab] = useState("total");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("startDate" as any, "asc");

  const sortedMeetings = useMemo(
    () =>
      applySort(meetings, (meeting: any, key: any) => {
        if (key === "startDate") {
          return new Date(meeting.startDate).getTime();
        }

        return meeting[key];
      }),
    [applySort, meetings],
  );

  const filters = useMemo(
    () => ({
      clients: uniqueSorted(sortedMeetings.map((meeting: any) => meeting.clientName)),
      advisors: uniqueSorted(sortedMeetings.map((meeting: any) => meeting.advisorName)),
    }),
    [sortedMeetings],
  );

  const counts = useMemo(() => {
    return {
      total: sortedMeetings.length,
      upcoming: sortedMeetings.filter((meeting: any) => meeting.status === "Upcoming").length,
      completed: sortedMeetings.filter((meeting: any) => meeting.status === "Completed").length,
      issues: sortedMeetings.filter((meeting: any) => meeting.status === "Issues").length,
    };
  }, [sortedMeetings]);

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return sortedMeetings.filter((meeting: any) => {
      const matchesTab =
        activeTab === "total" ||
        (activeTab === "upcoming" && meeting.status === "Upcoming") ||
        (activeTab === "completed" && meeting.status === "Completed") ||
        (activeTab === "issues" && meeting.status === "Issues");

      const matchesSearch =
        !normalizedQuery ||
        [
          meeting.eventName,
          meeting.status,
          meeting.clientName,
          meeting.advisorName,
          meeting.advisorEmail,
          meeting.issue,
          formatIsoDate(meeting.startDate),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesClient = clientFilter === "all" || meeting.clientName === clientFilter;
      const matchesAdvisor = advisorFilter === "all" || meeting.advisorName === advisorFilter;
      const matchesStatus = statusFilter === "all" || meeting.status === statusFilter;

      return matchesTab && matchesSearch && matchesClient && matchesAdvisor && matchesStatus;
    });
  }, [activeTab, advisorFilter, clientFilter, search, sortedMeetings, statusFilter]);

  const pagination = usePagination(
    filteredMeetings,
    5,
    `${activeTab}|${search}|${clientFilter}|${advisorFilter}|${statusFilter}`,
  );

  const activeCount = (counts as any)[activeTab];

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Meetings</p>
          <h1>Meeting bookings</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track meeting bookings across upcoming, completed, and issue states with search and filters.
          </p>
        </div>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          {tabOptions.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`grid gap-2 p-4 border rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "border-green bg-[rgba(46,222,190,0.12)] shadow-[0_4px_12px_rgba(46,222,190,0.12)]"
                    : "border-line bg-gradient-to-b from-white to-surface-soft hover:border-[rgba(46,222,190,0.55)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-muted text-xs m-0">{tab.label}</span>
                  <HugeiconsIcon
                    icon={tab.icon}
                    size={16}
                    strokeWidth={2}
                    className={isActive ? "text-green" : "text-muted opacity-40"}
                  />
                </div>
                <strong className="text-[28px] font-comfortaa">{(counts as any)[tab.id]}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Meetings table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredMeetings.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {activeCount} in {tabOptions.find((tab) => tab.id === activeTab)?.label.toLowerCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-3 mobile:grid-cols-1">
          <label className="grid gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-muted uppercase">
              <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2.5} />
              Search
            </span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by event, client, advisor, email..."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Client</span>
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="all">All clients</option>
              {filters.clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Advisor</span>
            <select value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)}>
              <option value="all">All advisors</option>
              {filters.advisors.map((advisor) => (
                <option key={advisor} value={advisor}>
                  {advisor}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">
            Use the status filter to narrow the table further without leaving the current tab.
          </p>
          <div className="flex items-center gap-3 mobile:flex-col mobile:items-stretch">
            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Completed">Completed</option>
                <option value="Issues">Issues</option>
              </select>
            </label>
            <button
              className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
              type="button"
              onClick={() => {
                setSearch("");
                setClientFilter("all");
                setAdvisorFilter("all");
                setStatusFilter("all");
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
              Clear filters
            </button>
          </div>
        </div>

        <MeetingsTable
          records={pagination.paginatedItems}
          onView={setSelectedMeeting}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>

      {selectedMeeting && <MeetingsModal meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} />}
    </div>
  );
}
