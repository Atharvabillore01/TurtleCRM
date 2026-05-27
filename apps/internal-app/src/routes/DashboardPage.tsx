import React, { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrainIcon,
  Analytics01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  Mail01Icon,
  Task01Icon,
  UserAccountIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { NavLink } from "react-router-dom";
import {
  initialClients,
  initialMeetings,
  initialTasks,
  initialLeads,
  initialOnboardingProspects,
  initialEmailTrackerEntries,
  initialAdvisors,
  initialTeamMembers,
} from "../data/mockData";
import { fetchMeetings } from "../api/meetingApi";

const stats = [
  {
    label: "Total Clients",
    getValue: () => initialClients.length,
    icon: UserGroupIcon,
    path: "/dashboard/clients",
    color: "from-[rgba(46,222,190,0.08)] to-[rgba(46,222,190,0.03)]",
    border: "border-[rgba(46,222,190,0.2)]",
  },
  {
    label: "Active Tasks",
    getValue: () => initialTasks.filter((t) => t.status !== "Completed").length,
    icon: Task01Icon,
    path: "/dashboard/tasks",
    color: "from-[rgba(255,193,87,0.08)] to-[rgba(255,193,87,0.03)]",
    border: "border-[rgba(255,193,87,0.2)]",
  },
  {
    label: "Meetings",
    getValue: () => initialMeetings.length,
    icon: Briefcase01Icon,
    path: "/dashboard/meetings",
    color: "from-[rgba(100,149,237,0.08)] to-[rgba(100,149,237,0.03)]",
    border: "border-[rgba(100,149,237,0.2)]",
  },
  {
    label: "Scheduled Emails",
    getValue: () => initialEmailTrackerEntries.length,
    icon: Mail01Icon,
    path: "/dashboard/email-tracker",
    color: "from-[rgba(255,119,119,0.08)] to-[rgba(255,119,119,0.03)]",
    border: "border-[rgba(255,119,119,0.2)]",
  },
  {
    label: "Pipeline Records",
    getValue: () => initialLeads.length + initialOnboardingProspects.length,
    icon: UserAccountIcon,
    path: "/dashboard/lead-journey",
    color: "from-[rgba(46,222,190,0.08)] to-[rgba(46,222,190,0.03)]",
    border: "border-[rgba(46,222,190,0.2)]",
  },
  {
    label: "Advisors",
    getValue: () => initialAdvisors.length,
    icon: AiBrainIcon,
    path: "/dashboard/manage-advisors",
    color: "from-[rgba(168,100,237,0.08)] to-[rgba(168,100,237,0.03)]",
    border: "border-[rgba(168,100,237,0.2)]",
  },
  {
    label: "Team Members",
    getValue: () => initialTeamMembers.length,
    icon: UserGroupIcon,
    path: "/dashboard/manage-team",
    color: "from-[rgba(46,222,190,0.08)] to-[rgba(46,222,190,0.03)]",
    border: "border-[rgba(46,222,190,0.2)]",
  },
];

const quickLinks = [
  { label: "AI Validation",  path: "/dashboard/ai-validation",  icon: AiBrainIcon,     desc: "Review and approve meeting data" },
  { label: "Lead Journey",   path: "/dashboard/lead-journey",   icon: UserAccountIcon, desc: "Track leads through the pipeline" },
  { label: "Tasks",          path: "/dashboard/tasks",          icon: Task01Icon,       desc: "Manage internal tasks and ownership" },
  { label: "Scheduling",     path: "/dashboard/scheduling",     icon: Calendar03Icon,   desc: "View and create advisor meetings" },
  { label: "Email Tracker",  path: "/dashboard/email-tracker",  icon: Mail01Icon,       desc: "Monitor scheduled email delivery" },
  { label: "Client Journey", path: "/dashboard/client-journey", icon: Analytics01Icon,  desc: "Review client progress and stages" },
];

export default function DashboardPage() {
  const [schedulingCount, setSchedulingCount] = useState<number | null>(null);

  useEffect(() => {
    fetchMeetings()
      .then((data) => setSchedulingCount(data.length))
      .catch(() => setSchedulingCount(0));
  }, []);

  const liveStats = [
    ...stats,
    {
      label: "Scheduling Records",
      getValue: () => schedulingCount ?? "…",
      icon: Calendar03Icon,
      path: "/dashboard/scheduling",
      color: "from-[rgba(255,193,87,0.08)] to-[rgba(255,193,87,0.03)]",
      border: "border-[rgba(255,193,87,0.2)]",
    },
  ];

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="grid gap-[22px]">
      {/* Header */}
      <header>
        <p className="text-green text-xs font-black uppercase font-montserrat m-0">Dashboard</p>
        <h1 className="mt-1 mb-2">{greeting}</h1>
        <p className="max-w-[640px] text-muted text-sm leading-[1.7] m-0">
          Welcome to the Turtle client intelligence platform. Here's a quick overview of your workspace.
        </p>
      </header>

      {/* Stats grid */}
      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <h2 className="mb-4">Overview</h2>
        <div className="grid grid-cols-4 gap-3 mobile:grid-cols-2">
          {liveStats.map(({ label, getValue, icon, path, color, border }: any) => (
            <NavLink
              key={path}
              to={path}
              className={`grid gap-3 p-4 border ${border} rounded-xl bg-gradient-to-b ${color} no-underline text-ink hover:shadow-md transition-shadow duration-200`}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted text-xs font-extrabold uppercase">{label}</span>
                <span className="grid w-7 h-7 place-items-center rounded-lg bg-[rgba(255,255,255,0.7)] border border-line">
                  <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />
                </span>
              </div>
              <strong className="text-[30px] font-comfortaa leading-none">{getValue()}</strong>
            </NavLink>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <section className="p-4 border border-line rounded-2xl bg-[rgba(255,255,255,0.96)] shadow-card">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2>Quick access</h2>
          <span className="inline-flex items-center min-h-[26px] rounded-full px-3 bg-[rgba(46,222,190,0.14)] text-[#137765] text-xs font-black whitespace-nowrap">
            All modules
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 mobile:grid-cols-1">
          {quickLinks.map(({ label, path, icon, desc }: any) => (
            <NavLink
              key={path}
              to={path}
              className="flex items-start gap-3 p-4 border border-line rounded-xl bg-white hover:border-[rgba(46,222,190,0.4)] hover:bg-[rgba(46,222,190,0.03)] transition-colors duration-150 no-underline text-ink"
            >
              <span className="grid w-9 h-9 place-items-center rounded-lg bg-[rgba(46,222,190,0.1)] border border-[rgba(46,222,190,0.18)] shrink-0">
                <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} className="text-green" />
              </span>
              <div>
                <strong className="block text-sm">{label}</strong>
                <span className="block mt-0.5 text-xs text-muted leading-[1.5]">{desc}</span>
              </div>
            </NavLink>
          ))}
        </div>
      </section>
    </div>
  );
}
