import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import turtleLogoWhite from "../../assets/turtle-logo-white.svg";
import {
  AiBrain01Icon,
  Analytics01Icon,
  Briefcase01Icon,
  Calendar01Icon,
  Coins01Icon,
  Home01Icon,
  Mail01Icon,
  NotebookIcon,
  Tag01Icon,
  Task01Icon,
  UserAccountIcon,
  UserGroupIcon,
  LayoutAlignRightIcon,
} from "@hugeicons/core-free-icons";
import { useAuth } from "../../hooks/useAuth.js";

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const navItems = [
  { label: "Dashboard",              path: "/dashboard",                       icon: Home01Icon },
  { label: "Clients",                path: "/dashboard/clients",               icon: UserGroupIcon },
  { label: "Lead Journey",           path: "/dashboard/lead-journey",          icon: UserAccountIcon },
  { label: "AI Validation",          path: "/dashboard/ai-validation",         icon: AiBrain01Icon },
  { label: "Scheduling",             path: "/dashboard/scheduling",            icon: Calendar01Icon },
  { label: "Tasks",                  path: "/dashboard/tasks",                 icon: Task01Icon },
  { label: "Meetings",               path: "/dashboard/meetings",              icon: Briefcase01Icon },
  { label: "Client Journey",         path: "/dashboard/client-journey",        icon: Analytics01Icon },
  { label: "Email Tracker",          path: "/dashboard/email-tracker",         icon: Mail01Icon },
  { label: "Manage Advisors",        path: "/dashboard/manage-advisors",       icon: UserAccountIcon },
  { label: "Manage Team",            path: "/dashboard/manage-team",           icon: UserGroupIcon },
  { label: "Manage Milestones",      path: "/dashboard/manage-milestones",     icon: Task01Icon },
  { label: "Manage Tags",            path: "/dashboard/manage-tags",           icon: Tag01Icon },
  { label: "Manage Membership",  path: "/dashboard/manage-membership", icon: Coins01Icon },
];

export default function Sidebar({ isCollapsed, toggleCollapse }: any) {
  const { logout, name, email } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <aside
      className={`sticky top-0 h-screen flex flex-col gap-5 py-[22px] bg-[#1d1d1d] text-white transition-all duration-300 overflow-x-hidden mobile:static mobile:h-auto ${
        isCollapsed ? "px-2 w-[70px]" : "px-4 w-[270px]"
      }`}
      aria-label="Main navigation"
    >
      <div className={`flex items-center min-h-[60px] ${isCollapsed ? "justify-center flex-col gap-3" : "justify-between gap-3"}`}>
        {!isCollapsed && (
          <img
            src={turtleLogoWhite}
            alt="Turtle logo"
            className="block h-[52px] w-full max-w-[180px] object-contain"
          />
        )}
        <button
          type="button"
          onClick={toggleCollapse}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer text-white flex-none"
          aria-label="Toggle sidebar"
        >
          <HugeiconsIcon
            icon={LayoutAlignRightIcon}
            size={20}
            strokeWidth={1.8}
            className={`transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div className="grid gap-[10px] min-h-0 flex-1 overflow-hidden">
        <nav className="grid gap-3 overflow-y-auto overflow-x-hidden pr-[2px]">
          {navItems.map(({ label, path, icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/dashboard"}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2 min-h-[46px] rounded-xl font-extrabold text-left cursor-pointer transition-all duration-300 no-underline ${
                  isCollapsed ? "justify-center px-0 mx-auto w-[46px]" : "w-full px-3"
                } ${
                  isActive
                    ? "border border-[rgba(46,222,190,0.22)] bg-[rgba(46,222,190,0.12)] text-white"
                    : "border border-transparent bg-transparent text-[rgba(248,251,248,0.72)] hover:bg-[rgba(255,255,255,0.04)]"
                }`
              }
            >
              <span
                className="grid w-8 h-8 place-items-center rounded-lg flex-none bg-[rgba(255,255,255,0.06)]"
                aria-hidden="true"
              >
                <HugeiconsIcon icon={icon} size={isCollapsed ? 20 : 18} strokeWidth={1.8} color="currentColor" />
              </span>
              {!isCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className={`border-t border-[rgba(255,255,255,0.08)] pt-4 ${isCollapsed ? "flex justify-center" : ""}`}>
        {!isCollapsed && (name || email) && (
          <div className="mb-3 px-1">
            {name && <p className="text-white text-sm font-semibold truncate">{name}</p>}
            {email && <p className="text-[rgba(248,251,248,0.48)] text-xs truncate">{email}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : undefined}
          className={`flex items-center gap-2 min-h-[46px] rounded-xl font-extrabold text-left cursor-pointer transition-all duration-300 text-[rgba(248,251,248,0.72)] hover:bg-[rgba(255,80,80,0.1)] hover:text-red-400 border border-transparent ${
            isCollapsed ? "justify-center px-0 mx-auto w-[46px]" : "w-full px-3"
          }`}
        >
          <span className="grid w-8 h-8 place-items-center rounded-lg flex-none bg-[rgba(255,255,255,0.06)]" aria-hidden="true">
            <IconLogout />
          </span>
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
