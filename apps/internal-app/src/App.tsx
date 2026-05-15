import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { Toaster } from "react-hot-toast";
import DashboardPage from "./routes/DashboardPage";
import AiValidationPage from "./routes/AiValidationPage";
import ClientsPage from "./routes/ClientsPage";
import LeadJourneyPage from "./routes/LeadJourneyPage";
import SchedulingPage from "./routes/SchedulingPage";
import MeetingsPage from "./routes/MeetingsPage";
import ClientJourneyPage from "./routes/ClientJourneyPage";
import EmailTrackerPage from "./routes/EmailTrackerPage";
import TasksPage from "./routes/TasksPage";
import ManageAdvisorsPage from "./routes/ManageAdvisorsPage";
import ManageTeamPage from "./routes/ManageTeamPage";
import ManageTagsPage from "./routes/ManageTagsPage";
import ManageMilestonesPage from "./routes/ManageMilestonesPage";
import {AutofillPage} from "./pages/AutofillPage";
import PlaceholderModule from "./components/shared/PlaceholderModule";

export default function App() {
  return (
    <>
      <Toaster 
        position="top-right" 
        reverseOrder={false} 
        containerStyle={{ zIndex: 99999 }}
      />
      <Routes>
        {/* Redirect bare root to /dashboard */}
      <Route index element={<Navigate to="/dashboard" replace />} />

      {/* All app routes live under /dashboard */}
      <Route path="/dashboard" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="clients"         element={<ClientsPage />} />
        <Route path="lead-journey"    element={<LeadJourneyPage />} />
        <Route path="ai-validation"   element={<AiValidationPage />} />
        <Route path="scheduling"      element={<SchedulingPage />} />
        <Route path="tasks"           element={<TasksPage />} />
        <Route path="meetings"        element={<MeetingsPage />} />
        <Route path="client-journey"  element={<ClientJourneyPage />} />
        <Route path="email-tracker"   element={<EmailTrackerPage />} />
        <Route path="manage-advisors" element={<ManageAdvisorsPage />} />
        <Route path="manage-team"     element={<ManageTeamPage />} />
        <Route path="manage-milestones"     element={<ManageMilestonesPage />} />
        <Route path="manage-tags"           element={<ManageTagsPage />} />
        <Route path="manage-membership" element={<PlaceholderModule title="Manage Membership" />} />
        <Route path="autofill"          element={<AutofillPage />} />
      </Route>

      {/* Catch-all → /dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </>
  );
}
