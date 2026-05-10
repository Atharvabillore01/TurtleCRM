import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div className={`grid min-h-screen mobile:grid-cols-1 transition-all duration-300 ${isCollapsed ? "grid-cols-[80px_minmax(0,1fr)]" : "grid-cols-[260px_minmax(0,1fr)]"}`}>
      <Sidebar isCollapsed={isCollapsed} toggleCollapse={() => setIsCollapsed(!isCollapsed)} />
      <main className="min-w-0 p-6 mobile:p-4 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
