import React, { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AllBookmarkIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FilterIcon,
  Mail01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import EmailTrackerModal from "./EmailTrackerModal";
import EmailTrackerTable from "./EmailTrackerTable";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const tabOptions = [
  { id: "waiting", label: "Waiting", icon: Clock01Icon },
  { id: "delivered", label: "Delivered", icon: CheckmarkCircle02Icon },
  { id: "all", label: "All emails", icon: AllBookmarkIcon },
];

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

function isSameDay(left: any, right: any) {
  return left.toDateString() === right.toDateString();
}

function isWithinDays(date: any, days: any) {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return date <= limit;
}

export default function EmailTrackerView({ emails }: any) {
  const [activeTab, setActiveTab] = useState("waiting");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState(null);

  const clients = useMemo(() => uniqueSorted(emails.map((email: any) => email.clientName)), [emails]);
  const advisors = useMemo(() => uniqueSorted(emails.map((email: any) => email.advisorName)), [emails]);
  const channels = useMemo(() => uniqueSorted(emails.map((email: any) => email.channel)), [emails]);

  const filteredEmails = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return emails.filter((email: any) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "waiting" && email.status === "Waiting") ||
        (activeTab === "delivered" && email.status === "Delivered");

      const matchesSearch =
        !normalizedSearch ||
        [
          email.clientName,
          email.clientEmail,
          email.subject,
          email.preview,
          email.advisorName,
          email.advisorEmail,
          email.channel,
          email.status,
          email.scheduledAt,
          email.deliveredAt,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesClient = clientFilter === "all" || email.clientName === clientFilter;
      const matchesAdvisor = advisorFilter === "all" || email.advisorName === advisorFilter;
      const matchesChannel = channelFilter === "all" || email.channel === channelFilter;

      return matchesTab && matchesSearch && matchesClient && matchesAdvisor && matchesChannel;
    });
  }, [activeTab, advisorFilter, channelFilter, clientFilter, emails, search]);

  const pagination = usePagination(filteredEmails, 5, `${activeTab}|${search}|${clientFilter}|${advisorFilter}|${channelFilter}`);

  const totalEmails = emails.length;
  const waitingCount = emails.filter((email: any) => email.status === "Waiting").length;
  const deliveredCount = emails.filter((email: any) => email.status === "Delivered").length;

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayWaiting = emails.filter((email: any) => email.status === "Waiting" && isSameDay(new Date(email.scheduledAt), today)).length;
  const tomorrowWaiting = emails.filter((email: any) => email.status === "Waiting" && isSameDay(new Date(email.scheduledAt), tomorrow)).length;
  const weekWaiting = emails.filter((email: any) => email.status === "Waiting" && isWithinDays(new Date(email.scheduledAt), 7)).length;

  function handleSearchSubmit(event: any) {
    event.preventDefault();
  }

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Email Tracker</p>
          <h1>Scheduled mail queue</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            See outgoing emails that are waiting to be sent and the history of emails that were already delivered.
          </p>
        </div>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          {tabOptions.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = tab.id === "all" ? totalEmails : tab.id === "waiting" ? waitingCount : deliveredCount;

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
                <strong className="text-[28px] font-comfortaa">{count}</strong>
              </button>
            );
          })}
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Sending today</span>
            <strong className="text-[28px] font-comfortaa">{todayWaiting}</strong>
          </article>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Email history</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredEmails.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {tabOptions.find((tab) => tab.id === activeTab)?.label}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.7fr))] mobile:grid-cols-1">
          <form className="flex gap-2 items-end" onSubmit={handleSearchSubmit}>
            <label className="grid gap-2 flex-1">
              <span className="text-xs font-extrabold text-muted uppercase">Search mails</span>
              <input
                className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by client, subject, advisor, email..."
              />
            </label>
            <button
              className="inline-flex items-center gap-2 min-h-[42px] px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer shrink-0 transition-transform active:scale-[0.98]"
              type="submit"
            >
              <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={2.5} />
              Search
            </button>
          </form>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Client</span>
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="all">All clients</option>
              {clients.map((client) => (
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
              {advisors.map((advisor) => (
                <option key={advisor} value={advisor}>
                  {advisor}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Channel</span>
            <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
              <option value="all">All channels</option>
              {channels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">
            Use the tabs to switch between waiting mail and delivered history.
          </p>
          <button
            className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={() => {
              setSearch("");
              setClientFilter("all");
              setAdvisorFilter("all");
              setChannelFilter("all");
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
            Clear filters
          </button>
        </div>

        <EmailTrackerTable records={pagination.paginatedItems} onView={setSelectedEmail} />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>

      {selectedEmail && <EmailTrackerModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />}
    </div>
  );
}
