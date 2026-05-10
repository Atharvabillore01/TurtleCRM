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
import IconLabelButton from "../shared/IconLabelButton";
import ManageTeamModal from "./ManageTeamModal";
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

export default function ManageTeamView({ members, onCreateMember, onUpdateMember, onDeleteMember }: any) {
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [modalMember, setModalMember] = useState(null);
  const [modalMode, setModalMode] = useState("view");
  const { sortKey, sortDirection, handleSort, applySort } = useTableSort("fullName" as any, "asc");

  const memberViews = useMemo(
    () =>
      applySort(
        members.map((member: any) => ({
          ...member,
        })),
        (member: any, key: any) => {
          if (key === "contact") {
            return `${member.countryCode || ""}${member.phoneNo || ""}`;
          }

          return member[key];
        },
      ),
    [applySort, members],
  );

  const filters = useMemo(
    () => ({
      departments: uniqueSorted(memberViews.map((member: any) => member.department)),
      roles: uniqueSorted(memberViews.map((member: any) => member.role)),
      genders: uniqueSorted(memberViews.map((member: any) => member.gender)),
    }),
    [memberViews],
  );

  const counts = useMemo(
    () => ({
      total: memberViews.length,
      leaders: memberViews.filter((member: any) => member.role === "Team Lead" || member.role === "Manager").length,
      support: memberViews.filter((member: any) => member.department === "Operations" || member.department === "Client Success").length,
    }),
    [memberViews],
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return memberViews.filter((member: any) => {
      const matchesSearch =
        !normalizedQuery ||
        [
          member.fullName,
          member.salutation,
          member.gender,
          member.countryCode,
          member.phoneNo,
          member.phone2,
          member.email,
          member.department,
          member.role,
          member.displayRole,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesDepartment = departmentFilter === "all" || member.department === departmentFilter;
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesGender = genderFilter === "all" || member.gender === genderFilter;

      return matchesSearch && matchesDepartment && matchesRole && matchesGender;
    });
  }, [departmentFilter, genderFilter, memberViews, roleFilter, search]);

  const pagination = usePagination(filteredMembers, 5, `${search}|${departmentFilter}|${roleFilter}|${genderFilter}`);

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Manage team</p>
          <h1>Team directory</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Manage the full team list with create, edit, delete, search, and filter capabilities.
          </p>
        </div>
        <IconLabelButton
          icon={Add01Icon}
          className="min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer shrink-0"
          type="button"
          onClick={() => {
            setModalMode("create");
            setModalMember(null);
          }}
        >
          Add team member
        </IconLabelButton>
      </header>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="grid grid-cols-3 gap-3 mobile:grid-cols-1">
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Total members</span>
            <strong className="text-[28px] font-comfortaa">{counts.total}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Leads and managers</span>
            <strong className="text-[28px] font-comfortaa">{counts.leaders}</strong>
          </article>
          <article className="grid gap-2 p-4 border border-line rounded-xl bg-gradient-to-b from-white to-surface-soft">
            <span className="text-muted text-xs m-0">Support staff</span>
            <strong className="text-[28px] font-comfortaa">{counts.support}</strong>
          </article>
        </div>
      </section>

      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4 mobile:flex-col mobile:items-start">
          <div>
            <h2>Team table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredMembers.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            All team records
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,0.55fr))] mobile:grid-cols-1">
          <label className="grid gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-muted uppercase">
              <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2.5} />
              Search
            </span>
            <div className="flex items-center gap-2 min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] bg-white">
              <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} color="currentColor" />
              <input
                className="w-full border-0 outline-none bg-transparent"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, phone, role..."
              />
            </div>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Department</span>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="all">All departments</option>
              {filters.departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Role</span>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="all">All roles</option>
              {filters.roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
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
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">Use edit to update profile data and delete to remove team members from the directory.</p>
          <IconLabelButton
            icon={Cancel01Icon}
            className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
            type="button"
            onClick={() => {
              setSearch("");
              setDepartmentFilter("all");
              setRoleFilter("all");
              setGenderFilter("all");
            }}
          >
            Clear filters
          </IconLabelButton>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="grid gap-1 p-4 border border-dashed border-[rgba(46,222,190,0.42)] rounded-[14px] bg-[rgba(245,255,252,0.72)]">
            <strong>No team members found</strong>
            <span className="text-muted">Try a different search term or filter selection.</span>
          </div>
        ) : (
          <div className="overflow-x-hidden border border-line rounded-xl bg-gradient-to-b from-[rgba(245,255,252,0.92)] to-[rgba(255,255,255,0.98)]">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[17%]" />
                <col className="w-[14%]" />
                <col className="w-[17%]" />
                <col className="w-[10%]" />
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
                    label="Department"
                    icon={<HugeiconsIcon icon={FilterIcon} size={13} strokeWidth={2.5} />}
                    sortKey="department"
                    currentSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTableHeader label="Role" sortKey="role" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableTableHeader label="Display role" sortKey="displayRole" currentSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map((member: any) => (
                  <tr key={member.id}>
                    <td className="align-top">
                      <div className="flex items-center gap-3 min-w-0">
                        {member.profileImage ? (
                          <img
                            src={member.profileImage}
                            alt={member.fullName}
                            className="h-10 w-10 rounded-full object-cover border border-[rgba(46,222,190,0.25)] shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full grid place-items-center bg-[rgba(46,222,190,0.12)] text-[#137765] font-black shrink-0">
                            {getInitials(member.fullName) || "T"}
                          </div>
                        )}
                        <span className="block text-[11px] text-muted break-all">{member.id}</span>
                      </div>
                    </td>
                    <td className="align-top">
                      <strong className="block break-words leading-[1.45]">{member.fullName}</strong>
                    </td>
                    <td className="align-top">{member.salutation}</td>
                    <td className="align-top">{member.gender}</td>
                    <td className="align-top">
                      <div className="grid gap-1">
                        <span className="block text-[11px] text-muted break-all">
                          {member.countryCode} {member.phoneNo}
                        </span>
                        <span className="block text-[11px] text-muted break-all">{member.phone2 || "No phone 2"}</span>
                      </div>
                    </td>
                    <td className="align-top">
                      <span className="block break-words leading-[1.45]">{member.department}</span>
                    </td>
                    <td className="align-top">
                      <span className="block break-words leading-[1.45]">{member.role}</span>
                    </td>
                    <td className="align-top">
                      <span className="block break-words leading-[1.45]">{member.displayRole || "-"}</span>
                    </td>
                    <td className="align-top">
                      <div className="flex flex-wrap gap-2">
                        <IconLabelButton
                          icon={ViewIcon}
                          className="min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer"
                          type="button"
                          onClick={() => {
                            setModalMode("view");
                            setModalMember(member);
                          }}
                        >
                          View
                        </IconLabelButton>
                        <IconLabelButton
                          icon={Edit02Icon}
                          className="min-h-[28px] px-[9px] border border-line rounded-lg bg-white text-ink text-[11px] font-black font-montserrat cursor-pointer"
                          type="button"
                          onClick={() => {
                            setModalMode("edit");
                            setModalMember(member);
                          }}
                        >
                          Edit
                        </IconLabelButton>
                        <IconLabelButton
                          icon={Delete02Icon}
                          className="min-h-[28px] px-[9px] border border-[rgba(255,120,120,0.5)] rounded-lg bg-[rgba(255,120,120,0.08)] text-[#a23434] text-[11px] font-black font-montserrat cursor-pointer"
                          type="button"
                          onClick={() => {
                            const name = member.fullName;
                            const id = member.id;
                            toast((t: any) => (
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-ink">
                                  Delete team member <b className="text-red">"{name}"</b>?
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      onDeleteMember(id);
                                      toast.dismiss(t.id);
                                      toast.success(`Team member ${name} deleted`, { icon: "🗑️" });
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
                          Delete
                        </IconLabelButton>
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

      {modalMember && (
        <ManageTeamModal
          mode={modalMode}
          member={modalMember}
          onClose={() => {
            setModalMember(null);
            setModalMode("view");
          }}
          onCreate={(payload: any) => {
            onCreateMember(payload);
            setModalMember(null);
            setModalMode("view");
          }}
          onSave={(payload: any) => {
            onUpdateMember(payload);
            setModalMember(null);
            setModalMode("view");
          }}
        />
      )}

      {modalMode === "create" && !modalMember && (
        <ManageTeamModal
          mode="create"
          member={null}
          onClose={() => setModalMode("view")}
          onCreate={(payload: any) => {
            onCreateMember(payload);
            setModalMode("view");
          }}
          onSave={(payload: any) => {
            onUpdateMember(payload);
            setModalMode("view");
          }}
        />
      )}
    </div>
  );
}
