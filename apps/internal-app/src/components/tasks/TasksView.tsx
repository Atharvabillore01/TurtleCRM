import React, { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  FilterIcon,
  ListViewIcon,
  Search01Icon,
  Sorting01Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import TasksModal from "./TasksModal";
import TasksTable from "./TasksTable";
import { formatIsoDate, isBeforeToday } from "../../utils/dateTime";
import TablePagination from "../shared/TablePagination";
import usePagination from "../shared/usePagination";

const tabOptions = [
  { id: "pendings", label: "Pendings", icon: Task01Icon },
  { id: "overdue", label: "Overdue", icon: Clock01Icon },
  { id: "completed", label: "Completed", icon: CheckmarkCircle02Icon },
  { id: "all", label: "All Tasks", icon: ListViewIcon },
];

function uniqueSorted(values: any[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first: any, second: any) => first.localeCompare(second));
}

function createTaskView(task: any) {
  const isCompleted = task.status === "Completed";
  const isOverdue = !isCompleted && isBeforeToday(task.dueDate);

  return {
    ...task,
    displayStatus: isCompleted ? "Completed" : isOverdue ? "Overdue" : task.status,
    isOverdue,
  };
}

export default function TasksView({ tasks, onCreateTask, onUpdateTask }: any) {
  const [activeTab, setActiveTab] = useState("pendings");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [advisorFilter, setAdvisorFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [modalTask, setModalTask] = useState(null);
  const [modalMode, setModalMode] = useState("view");

  const taskViews = useMemo(() => tasks.map(createTaskView).sort((first: any, second: any) => {
    const firstDue = new Date(first.dueDate).getTime();
    const secondDue = new Date(second.dueDate).getTime();

    if (firstDue !== secondDue) {
      return firstDue - secondDue;
    }

    return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
  }), [tasks]);

  const filters = useMemo(() => {
    return {
      clients: uniqueSorted(taskViews.map((task: any) => task.client)),
      assignedTo: uniqueSorted(taskViews.map((task: any) => task.assignedTo)),
      advisors: uniqueSorted(taskViews.flatMap((task: any) => task.advisors)),
      scopes: uniqueSorted(taskViews.map((task: any) => task.scope)),
    };
  }, [taskViews]);

  const counts = useMemo(() => {
    return {
      pendings: taskViews.filter((task: any) => !task.isOverdue && task.status !== "Completed").length,
      overdue: taskViews.filter((task: any) => task.isOverdue).length,
      completed: taskViews.filter((task: any) => task.status === "Completed").length,
      all: taskViews.length,
    };
  }, [taskViews]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return taskViews.filter((task: any) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "completed" && task.status === "Completed") ||
        (activeTab === "overdue" && task.isOverdue) ||
        (activeTab === "pendings" && !task.isOverdue && task.status !== "Completed");

      const matchesSearch =
        !normalizedQuery ||
        [
          task.client,
          task.assignedTo,
          task.advisors.join(", "),
          task.title,
          task.scope,
          task.status,
          task.displayStatus,
          formatIsoDate(task.createdAt),
          formatIsoDate(task.dueDate),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesClient = clientFilter === "all" || task.client === clientFilter;
      const matchesAssigned = assignedFilter === "all" || task.assignedTo === assignedFilter;
      const matchesAdvisor = advisorFilter === "all" || task.advisors.includes(advisorFilter);
      const matchesScope = scopeFilter === "all" || task.scope === scopeFilter;

      return matchesTab && matchesSearch && matchesClient && matchesAssigned && matchesAdvisor && matchesScope;
    });
  }, [activeTab, advisorFilter, assignedFilter, clientFilter, scopeFilter, search, taskViews]);

  const pagination = usePagination(
    filteredTasks,
    5,
    `${activeTab}|${search}|${clientFilter}|${assignedFilter}|${advisorFilter}|${scopeFilter}`,
  );

  const activeCount = (counts as any)[activeTab];

  function handleSave(updatedTask: any) {
    onUpdateTask(updatedTask);
    setModalTask(null);
  }

  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 flex-wrap mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">Tasks</p>
          <h1>Task management</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            Track client work with status tabs, quick search, filters, and direct view/edit actions from the table.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer shrink-0 transition-transform active:scale-[0.98]"
          type="button"
          onClick={() => {
            setModalMode("create");
            setModalTask(null);
          }}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          Create internal task
        </button>
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
            <h2>Task table</h2>
            <p className="mt-1 text-muted text-xs m-0">{filteredTasks.length} matching rows</p>
          </div>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            {activeCount} in {tabOptions.find((tab: any) => tab.id === activeTab)?.label.toLowerCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-2 xl:grid-cols-5 mobile:grid-cols-1">
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
              placeholder="Search by client, title, advisor, scope..."
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
            <span className="text-xs font-extrabold text-muted uppercase">Assigned to</span>
            <select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)}>
              <option value="all">All members</option>
              {filters.assignedTo.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Advisor</span>
            <select value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)}>
              <option value="all">All advisors</option>
              {filters.advisors.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-muted uppercase">
              <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2.5} />
              Scope
            </span>
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
              <option value="all">All scopes</option>
              {filters.scopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mobile:flex-col mobile:items-start">
          <p className="m-0 text-muted text-xs">
            Created and due dates are shown in a local human-readable format. Overdue items are derived from the due date and current date.
          </p>
          <button
            className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
            type="button"
            onClick={() => {
              setSearch("");
              setClientFilter("all");
              setAssignedFilter("all");
              setAdvisorFilter("all");
              setScopeFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>

        <TasksTable
          records={pagination.paginatedItems}
          onView={(task: any) => {
            setModalMode("view");
            setModalTask(task);
          }}
          onEdit={(task: any) => {
            setModalMode("edit");
            setModalTask(task);
          }}
        />
        <TablePagination {...pagination} onPageChange={pagination.setCurrentPage} />
      </section>

      {modalTask && (
        <TasksModal
          mode={modalMode}
          task={modalTask}
          onClose={() => {
            setModalTask(null);
            setModalMode("view");
          }}
          onCreate={(payload: any) => {
            onCreateTask(payload);
            setModalTask(null);
            setModalMode("view");
          }}
          onSave={handleSave}
        />
      )}

      {modalMode === "create" && !modalTask && (
        <TasksModal
          mode="create"
          task={null}
          onClose={() => setModalMode("view")}
          onCreate={(payload: any) => {
            onCreateTask(payload);
            setModalMode("view");
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
