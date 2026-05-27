import React, { useMemo, useState } from "react";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const verticals = [
  { key: "financialPlan", label: "Financial Plan" },
  { key: "taxPlanning", label: "Tax Planning" },
  { key: "insurance", label: "Insurance" },
  { key: "creditCards", label: "Credit Cards" },
  { key: "banking", label: "Banking++" },
  { key: "estatePlanning", label: "Estate Planning" },
  { key: "others", label: "Others" },
];

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

function pillClass(value: any) {
  const [doneText, totalText] = String(value || "0 / 0").split("/").map((part) => part.trim());
  const done = Number(doneText);
  const total = Number(totalText);

  if (!total) {
    return "bg-[#e8edf2] text-[#6d7480]";
  }

  if (done >= total) {
    return "bg-[#b7f5d8] text-[#14684f]";
  }

  return "bg-[#ffe680] text-[#8b5c00]";
}

export default function ClientJourneyView({ rows }: any) {
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("all");
  const [clientTypeFilter, setClientTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const managers = useMemo(() => uniqueSorted(rows.map((row: any) => row.manager)), [rows]);
  const clientTypes = useMemo(() => uniqueSorted(rows.map((row: any) => row.clientType)), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row: any) => {
      const matchesSearch =
        !normalizedSearch ||
        [row.clientName, row.assignedTo, row.manager, row.clientType, row.status, row.nextReviewDate, row.lastTouchDate]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesManager = managerFilter === "all" || row.manager === managerFilter;
      const matchesType = clientTypeFilter === "all" || row.clientType === clientTypeFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesFrom = !fromDate || row.nextReviewDate >= fromDate;
      const matchesTo = !toDate || row.nextReviewDate <= toDate;

      return matchesSearch && matchesManager && matchesType && matchesStatus && matchesFrom && matchesTo;
    });
  }, [clientTypeFilter, fromDate, managerFilter, rows, search, statusFilter, toDate]);

  const pagination = usePagination(
    filteredRows,
    5,
    `${search}|${managerFilter}|${clientTypeFilter}|${statusFilter}|${fromDate}|${toDate}`,
  );

  const total = rows.length;
  const active = rows.filter((row: any) => row.status === "Active").length;
  const completed = rows.filter((row: any) => row.status === "Completed").length;
  const risk = rows.filter((row: any) => row.status === "At Risk").length;

  function handleSearchSubmit(event: any) {
    event.preventDefault();
  }

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Client Journey</p>
          <h1>Journey Map</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track client progress across all service verticals.
          </p>
        </div>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Total clients</span>
            <strong className="text-[28px] font-comfortaa">{total}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Active</span>
            <strong className="text-[28px] font-comfortaa">{active}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Completed</span>
            <strong className="text-[28px] font-comfortaa">{completed}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">At risk</span>
            <strong className="text-[28px] font-comfortaa">{risk}</strong>
          </article>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
            <div>
              <h2>Journey table</h2>
              <p className="mt-1 text-muted text-xs m-0">{filteredRows.length} matching rows</p>
            </div>
            <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
              Journey map
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_repeat(5,minmax(0,0.7fr))] mobile:grid-cols-1">
            <form className="flex gap-2 items-end" onSubmit={handleSearchSubmit}>
              <label className="grid gap-2 flex-1">
                <span className="text-xs font-extrabold text-muted uppercase">Search clients</span>
                <input
                  className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search clients..."
                />
              </label>
              <button
                className="min-h-[42px] px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer shrink-0"
                type="submit"
              >
                Search
              </button>
            </form>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Manager</span>
              <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
                <option value="all">All Managers</option>
                {managers.map((manager) => (
                  <option key={manager} value={manager}>
                    {manager}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Client type</span>
              <select value={clientTypeFilter} onChange={(event) => setClientTypeFilter(event.target.value)}>
                <option value="all">All Client Types</option>
                {clientTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Status</option>
                <option value="New">New</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="At Risk">At Risk</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">From date</span>
              <input
                className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">To date</span>
              <input
                className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 mobile:flex-col mobile:items-start">
            <p className="m-0 text-muted text-xs">
              Use the filters to narrow by manager, type, status, or review date.
            </p>
            <button
              className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
              type="button"
              onClick={() => {
                setSearch("");
                setManagerFilter("all");
                setClientTypeFilter("all");
                setStatusFilter("all");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Client name</th>
                <th>Assigned to</th>
                {verticals.map((vertical) => (
                  <th key={vertical.key}>{vertical.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagination.paginatedItems.map((row: any) => (
                <tr key={row.id}>
                  <td className="align-top">
                    <strong className="block break-words leading-[1.4]">{row.clientName}</strong>
                  </td>
                  <td className="align-top">
                    <span className="block break-words">{row.assignedTo}</span>
                  </td>
                  {verticals.map((vertical) => (
                    <td className="align-top" key={`${row.id}:${vertical.key}`}>
                      <span
                        className={`inline-flex items-center min-h-[28px] px-3 rounded-full text-[11px] font-black ${pillClass(row[vertical.key])}`}
                        title={`${vertical.label}: ${row[vertical.key]}`}
                      >
                        {row[vertical.key]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>
    </div>
  );
}
