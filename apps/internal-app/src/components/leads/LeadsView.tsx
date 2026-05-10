import React, { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import LeadsTable from "./LeadsTable";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

export default function LeadsView({ leads, leadSearch, setLeadSearch, onOpenAddLead, onSelectLead }: any) {
  const filteredLeads = useMemo(() => {
    const normalizedQuery = leadSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return leads;
    }

    return leads.filter((lead: any) => Object.values(lead).some((value: any) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [leadSearch, leads]);

  const pagination = usePagination(filteredLeads, 5, leadSearch);

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Leads</p>
          <h1>Lead tracker</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            This table is ready for Google Sheet-style lead data with search, quick scanning, and manual entry from the app.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
          type="button"
          onClick={onOpenAddLead}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          Add entry
        </button>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2>Leads table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredLeads.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {leads.length} total leads
          </span>
        </div>

        <div className="flex items-center flex-wrap gap-[10px] mb-3">
          <label className="flex items-center gap-3 w-[min(100%,560px)] h-10 px-3 border border-line rounded-lg bg-white">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2.5} className="text-green" />
            <input
              className="w-full border-0 outline-none bg-transparent"
              type="search"
              value={leadSearch}
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Search by name, email, type, confidence, LinkedIn..."
            />
          </label>
        </div>

        <LeadsTable leads={pagination.paginatedItems} onSelectLead={onSelectLead} />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>
    </div>
  );
}
