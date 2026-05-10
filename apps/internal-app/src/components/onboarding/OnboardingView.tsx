import React, { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import OnboardingTable from "./OnboardingTable";
import { useTableSort } from "../shared/useTableSort";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

export default function OnboardingView({ prospects, onboardingSearch, setOnboardingSearch, onOpenModal }: any) {
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("fullName" as any, "asc");
  const sortedProspects = useMemo(() => applySort(prospects, (prospect: any, key: any) => prospect[key]), [applySort, prospects]);

  const filteredProspects = useMemo(() => {
    const normalizedQuery = onboardingSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return sortedProspects;
    }

    return sortedProspects.filter((item: any) => Object.values(item).some((value: any) => String(value).toLowerCase().includes(normalizedQuery)));
  }, [onboardingSearch, sortedProspects]);

  const pagination = usePagination(filteredProspects, 5, onboardingSearch);

  const totalProspects = prospects.length;
  const activeProspects = prospects.filter((item: any) => item.status === "Prospect").length;
  const deadpoolProspects = prospects.filter((item: any) => item.status === "Deadpool").length;

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Onboarding</p>
          <h1>Prospect onboarding</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track prospects, deadpool prospects, and start onboarding from KC bookings or manual entry.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
          type="button"
          onClick={onOpenModal}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          Onboard new member
        </button>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Total prospects</span>
            <strong className="text-[28px] font-comfortaa">{totalProspects}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Prospects</span>
            <strong className="text-[28px] font-comfortaa">{activeProspects}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Deadpool prospects</span>
            <strong className="text-[28px] font-comfortaa">{deadpoolProspects}</strong>
          </article>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2>Onboarding table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredProspects.length} matching rows</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-[10px] mb-3">
          <label className="flex items-center gap-3 w-[min(100%,560px)] h-10 px-3 border border-line rounded-lg bg-white">
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2.5} className="text-green" />
            <input
              className="w-full border-0 outline-none bg-transparent"
              type="search"
              value={onboardingSearch}
              onChange={(event) => setOnboardingSearch(event.target.value)}
              placeholder="Search by full name, status, phone, or email"
            />
          </label>
        </div>

        <OnboardingTable
          prospects={pagination.paginatedItems}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>
    </div>
  );
}
