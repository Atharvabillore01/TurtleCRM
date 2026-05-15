import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  FilterIcon,
  Mail01Icon,
  Search01Icon,
  UserAccountIcon,
  UserGroupIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import ManageAdvisorModal from "./ManageAdvisorModal";
import SortableTableHeader from "../shared/SortableTableHeader";
import { useTableSort } from "../shared/useTableSort";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

function getInitials(name: any) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: any) => part[0])
    .join("")
    .toUpperCase();
}

function formatDomains(domains: any) {
  if (!Array.isArray(domains)) {
    return domains || "";
  }

  return domains.join(", ");
}

export default function ManageAdvisorsView({ advisors, onCreateAdvisor, onUpdateAdvisor, onDeleteAdvisor }: any) {
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [modalAdvisor, setModalAdvisor] = useState(null);
  const [modalMode, setModalMode] = useState("view");
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("fullName" as any, "asc");

  const advisorViews = useMemo(
    () =>
      applySort(
        advisors.map((advisor: any) => ({
          ...advisor,
          domainsText: formatDomains(advisor.domains),
        })),
        (advisor: any, key: any) => {
          if (key === "contact") {
            return `${advisor.countryCode || ""}${advisor.phoneNo || ""}`;
          }

          return advisor[key];
        },
      ),
    [advisors, applySort],
  );

  const filters = useMemo(
    () => ({
      genders: uniqueSorted(advisorViews.map((advisor: any) => advisor.gender)),
      domains: uniqueSorted(advisorViews.flatMap((advisor: any) => advisor.domains)),
    }),
    [advisorViews],
  );

  const counts = useMemo(
    () => ({
      total: advisorViews.length,
      withDomains: advisorViews.filter((advisor: any) => advisor.domains?.length).length,
      withPhone2: advisorViews.filter((advisor: any) => advisor.phone2).length,
    }),
    [advisorViews],
  );

  const filteredAdvisors = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return advisorViews.filter((advisor: any) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          advisor.fullName,
          advisor.salutation,
          advisor.gender,
          advisor.countryCode,
          advisor.phoneNo,
          advisor.phone2,
          advisor.domainsText,
          advisor.email,
          advisor.displayDomain,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesGender = genderFilter === "all" || advisor.gender === genderFilter;
      const matchesDomain = domainFilter === "all" || (advisor.domains || []).includes(domainFilter);

      return matchesSearch && matchesGender && matchesDomain;
    });
  }, [advisorViews, domainFilter, genderFilter, search]);

  const pagination = usePagination(filteredAdvisors, 5, `${search}|${genderFilter}|${domainFilter}`);

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Manage advisors</p>
          <h1>Advisor directory</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Keep the complete advisor list in one place with create, edit, delete, and searchable profile details.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer shrink-0 transition-transform active:scale-[0.98]"
          type="button"
          onClick={() => {
            setModalMode("create");
            setModalAdvisor(null);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          Add advisor
        </button>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-3 gap-3 mobile:grid-cols-1">
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Total advisors</span>
            <strong className="text-[28px] font-comfortaa">{counts.total}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">With domains</span>
            <strong className="text-[28px] font-comfortaa">{counts.withDomains}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">With phone 2</span>
            <strong className="text-[28px] font-comfortaa">{counts.withPhone2}</strong>
          </article>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Advisor table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredAdvisors.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            All advisor records
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-[minmax(0,1.1fr)_repeat(2,minmax(0,0.7fr))] mobile:grid-cols-1">
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
              placeholder="Search by name, email, phone, domains..."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Gender</span>
            <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)}>
              <option value="all">All genders</option>
              {filters.genders.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Domain</span>
            <select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
              <option value="all">All domains</option>
              {filters.domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">
            Use edit to update profile data and delete to remove advisors from the directory.
          </p>
          <button
            className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={() => {
              setSearch("");
              setGenderFilter("all");
              setDomainFilter("all");
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
            Clear filters
          </button>
        </div>

        {filteredAdvisors.length === 0 ? (
          <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
            <strong>No advisors found</strong>
            <span className="text-muted">Try a different search term or filter selection.</span>
          </div>
        ) : (
          <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[11%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <div className="flex items-center gap-1.5 justify-center">
                      <HugeiconsIcon icon={UserAccountIcon} size={13} strokeWidth={2.5} />
                      Profile
                    </div>
                  </th>
                  <SortableTableHeader label="Full name" sortKey="fullName" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader label="Salutation" sortKey="salutation" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader label="Gender" sortKey="gender" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader label="Contact" sortKey="contact" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader
                    label="Domains"
                    icon={<HugeiconsIcon icon={FilterIcon} size={13} strokeWidth={2.5} />}
                    sortKey="domainsText"
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
                  <SortableTableHeader label="Display domain" sortKey="displayDomain" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((advisor: any) => (
                  <tr key={advisor.id}>
                    <td className="align-top">
                      <div className="flex items-center gap-3 min-w-0">
                        {advisor.profileImage ? (
                          <img
                            src={advisor.profileImage}
                            alt={advisor.fullName}
                            className="h-10 w-10 rounded-full object-cover border border-[rgba(46,222,190,0.25)] shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full grid place-items-center bg-[rgba(46,222,190,0.12)] text-[#137765] font-black shrink-0">
                            {getInitials(advisor.fullName) || "A"}
                          </div>
                        )}
                        <span className="block text-[11px] text-muted break-all">{advisor.id}</span>
                      </div>
                    </td>
                    <td className="align-top">
                      <strong className="block break-words leading-[1.45]">{advisor.fullName}</strong>
                    </td>
                    <td className="align-top">{advisor.salutation}</td>
                    <td className="align-top">{advisor.gender}</td>
                    <td className="align-top">
                      <div className="grid gap-1">
                        <span className="block text-[11px] text-muted break-all">
                          {advisor.countryCode} {advisor.phoneNo}
                        </span>
                        <span className="block text-[11px] text-muted break-all">{advisor.phone2 || "No phone 2"}</span>
                      </div>
                    </td>
                    <td className="align-top">
                      <span className="block break-words leading-[1.45]">{advisor.domainsText || "No domains"}</span>
                    </td>
                    <td className="align-top">
                      <span className="block break-all">{advisor.email}</span>
                    </td>
                    <td className="align-top">
                      <span className="block break-words leading-[1.45]">{advisor.displayDomain || "-"}</span>
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center gap-1.5 min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                          type="button"
                          onClick={() => {
                            setModalMode("view");
                            setModalAdvisor(advisor);
                          }}
                        >
                          <HugeiconsIcon icon={ViewIcon} size={13} strokeWidth={2.5} />
                          View
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer hover:bg-surface-soft"
                          type="button"
                          onClick={() => {
                            setModalMode("edit");
                            setModalAdvisor(advisor);
                          }}
                        >
                          <HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={2.5} />
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 min-h-[28px] px-[9px] border border-[rgba(255,120,120,0.5)] rounded-lg bg-[rgba(255,120,120,0.08)] text-[#a23434] text-[11px] font-black font-montserrat cursor-pointer hover:bg-[rgba(255,120,120,0.12)]"
                          type="button"
                          onClick={() => {
                            const name = advisor.fullName;
                            const id = advisor.id;
                            toast((t: any) => (
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-ink">
                                  Delete advisor <b className="text-red">"{name}"</b>?
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      onDeleteAdvisor(id);
                                      toast.dismiss(t.id);
                                      toast.success(`Advisor ${name} deleted`, { icon: "🗑️" });
                                    }}
                                    className="px-2 py-1 bg-red text-white text-[10px] font-black rounded-md hover:bg-red-600 transition-colors"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => toast.dismiss(t.id)}
                                    className="px-2 py-1 bg-surface-soft text-muted text-[10px] font-black rounded-md hover:bg-line transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ), {
                              duration: 5000,
                              style: { minWidth: '300px', padding: '12px', borderRadius: '12px' }
                            });
                          }}
                        >
                          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2.5} />
                          Delete
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

      {modalAdvisor && (
        <ManageAdvisorModal
          mode={modalMode}
          advisor={modalAdvisor}
          onClose={() => {
            setModalAdvisor(null);
            setModalMode("view");
          }}
          onCreate={(payload: any) => {
            onCreateAdvisor(payload);
            setModalAdvisor(null);
            setModalMode("view");
          }}
          onSave={(payload: any) => {
            onUpdateAdvisor(payload);
            setModalAdvisor(null);
            setModalMode("view");
          }}
        />
      )}

      {modalMode === "create" && !modalAdvisor && (
        <ManageAdvisorModal
          mode="create"
          advisor={null}
          onClose={() => setModalMode("view")}
          onCreate={(payload: any) => {
            onCreateAdvisor(payload);
            setModalMode("view");
          }}
          onSave={(payload: any) => {
            onUpdateAdvisor(payload);
            setModalMode("view");
          }}
        />
      )}
    </div>
  );
}
