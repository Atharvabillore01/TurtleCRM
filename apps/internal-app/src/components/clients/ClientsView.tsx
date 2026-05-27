import React, { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  FilterIcon,
  Mail01Icon,
  Search01Icon,
  UserAccountIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import ClientsModal from "./ClientsModal";
import { formatIsoDate } from "../../utils/dateTime";
import SortableTableHeader from "../shared/SortableTableHeader";
import { useTableSort } from "../shared/useTableSort";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const tabOptions = [
  { id: "total", label: "Total clients" },
  { id: "active", label: "Active membership" },
  { id: "expired", label: "Expired membership" },
  { id: "deadpool", label: "Deadpool" },
  { id: "renewal", label: "Up for renewal" },
];

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

function statusPillClass(status: any) {
  if (status === "Active Membership") {
    return "bg-[#d8fff6] text-[#0f6e5d]";
  }

  if (status === "Up for Renewal") {
    return "bg-[#fff1c9] text-[#946200]";
  }

  if (status === "Expired Membership") {
    return "bg-[#ffe4e1] text-[#a33a3a]";
  }

  return "bg-[#eceef5] text-[#5f6676]";
}

export default function ClientsView({ clients }: any) {
  const [activeTab, setActiveTab] = useState("total");
  const [search, setSearch] = useState("");
  const [clientTypeFilter, setClientTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignedToFilter, setAssignedToFilter] = useState("all");
  const [selectedClient, setSelectedClient] = useState(null);
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("subscriptionDate" as any, "desc");

  const sortedClients = useMemo(
    () =>
      applySort(clients, (client: any, key: any) => {
        if (key === "subscriptionDate") {
          return new Date(client.subscriptionDate).getTime();
        }

        return client[key];
      }),
    [clients, applySort],
  );

  const filters = useMemo(
    () => ({
      clientTypes: uniqueSorted(sortedClients.map((client: any) => client.clientType)),
      assignedTo: uniqueSorted(sortedClients.map((client: any) => client.assignedTo)),
    }),
    [sortedClients],
  );

  const counts = useMemo(
    () => ({
      total: sortedClients.length,
      active: sortedClients.filter((client: any) => client.subscriptionStatus === "Active Membership").length,
      expired: sortedClients.filter((client: any) => client.subscriptionStatus === "Expired Membership").length,
      deadpool: sortedClients.filter((client: any) => client.subscriptionStatus === "Deadpool").length,
      renewal: sortedClients.filter((client: any) => client.subscriptionStatus === "Up for Renewal").length,
    }),
    [sortedClients],
  );

  const filteredClients = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return sortedClients.filter((client: any) => {
      const matchesTab =
        activeTab === "total" ||
        (activeTab === "active" && client.subscriptionStatus === "Active Membership") ||
        (activeTab === "expired" && client.subscriptionStatus === "Expired Membership") ||
        (activeTab === "deadpool" && client.subscriptionStatus === "Deadpool") ||
        (activeTab === "renewal" && client.subscriptionStatus === "Up for Renewal");

      const matchesSearch =
        !normalizedQuery ||
        [
          client.fullName,
          client.clientType,
          client.subscriptionStatus,
          client.email,
          client.phoneNumber,
          client.assignedTo,
          formatIsoDate(client.subscriptionDate),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesType = clientTypeFilter === "all" || client.clientType === clientTypeFilter;
      const matchesStatus = statusFilter === "all" || client.subscriptionStatus === statusFilter;
      const matchesAssigned = assignedToFilter === "all" || client.assignedTo === assignedToFilter;

      return matchesTab && matchesSearch && matchesType && matchesStatus && matchesAssigned;
    });
  }, [activeTab, assignedToFilter, clientTypeFilter, search, sortedClients, statusFilter]);

  const pagination = usePagination(
    filteredClients,
    5,
    `${activeTab}|${search}|${clientTypeFilter}|${statusFilter}|${assignedToFilter}`,
  );

  const activeCount = (counts as any)[activeTab];

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Clients</p>
          <h1>Client memberships</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track all clients by membership state with quick search, filters, and subscription visibility in one place.
          </p>
        </div>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-5 gap-3 mobile:grid-cols-2">
          {tabOptions.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`grid gap-2 p-4 border rounded-xl text-left transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? "border-green bg-[rgba(46,222,190,0.12)] shadow-[inset_0_0_0_1px_rgba(46,222,190,0.22)]"
                    : "border-line bg-gradient-to-b from-white to-surface-soft hover:border-[rgba(46,222,190,0.55)]"
                }`}
              >
                <span className="text-muted text-xs m-0">{tab.label}</span>
                <strong className="text-[28px] font-comfortaa">{(counts as any)[tab.id]}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Clients table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredClients.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {activeCount} in {tabOptions.find((tab) => tab.id === activeTab)?.label.toLowerCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-4 mobile:grid-cols-1">
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
              placeholder="Search by name, email, phone, assignee..."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Client type</span>
            <select value={clientTypeFilter} onChange={(event) => setClientTypeFilter(event.target.value)}>
              <option value="all">All client types</option>
              {filters.clientTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Subscription status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="Active Membership">Active Membership</option>
              <option value="Expired Membership">Expired Membership</option>
              <option value="Deadpool">Deadpool</option>
              <option value="Up for Renewal">Up for Renewal</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Assigned to</span>
            <select value={assignedToFilter} onChange={(event) => setAssignedToFilter(event.target.value)}>
              <option value="all">All assignees</option>
              {filters.assignedTo.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">
            Filter clients by membership state, type, or ownership without leaving the current tab.
          </p>
          <button
            className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={() => {
              setSearch("");
              setClientTypeFilter("all");
              setStatusFilter("all");
              setAssignedToFilter("all");
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
            Clear filters
          </button>
        </div>

        {filteredClients.length === 0 ? (
          <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
            <strong>No clients found</strong>
            <span className="text-muted">Try a different search term or filter selection.</span>
          </div>
        ) : (
          <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[19%]" />
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr>
                  <SortableTableHeader
                    label="Full name"
                    icon={<HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />}
                    sortKey="fullName"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTableHeader label="Client type" sortKey="clientType" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader
                    label="Subscription status"
                    icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} strokeWidth={2.5} />}
                    sortKey="subscriptionStatus"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTableHeader
                    label="Email"
                    icon={<HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2.5} />}
                    sortKey="email"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTableHeader label="Phone numbers" sortKey="phoneNumber" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader
                    label="Subscription date"
                    icon={<HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2.5} />}
                    sortKey="subscriptionDate"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTableHeader label="Assigned to" sortKey="assignedTo" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((client: any) => (
                  <tr
                    key={client.id}
                    className="cursor-pointer transition-colors duration-150 hover:bg-[rgba(46,222,190,0.06)]"
                    onClick={() => setSelectedClient(client)}
                  >
                    <td className="align-top">
                      <button
                        className="block p-0 border-0 bg-transparent text-left cursor-pointer"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedClient(client);
                        }}
                      >
                        <strong className="block break-words leading-[1.45]">{client.fullName}</strong>
                      </button>
                    </td>
                    <td className="align-top">{client.clientType}</td>
                    <td className="align-top">
                      <span className={`inline-flex items-center min-h-7 px-2.5 rounded-full text-[11px] font-extrabold ${statusPillClass(client.subscriptionStatus)}`}>
                        {client.subscriptionStatus}
                      </span>
                    </td>
                    <td className="align-top">
                      <span className="block break-all">{client.email}</span>
                    </td>
                    <td className="align-top">
                      <span className="block break-all">{client.phoneNumber}</span>
                    </td>
                    <td className="align-top">{formatIsoDate(client.subscriptionDate)}</td>
                    <td className="align-top">{client.assignedTo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>

      {selectedClient && <ClientsModal client={selectedClient} onClose={() => setSelectedClient(null)} />}
    </div>
  );
}
