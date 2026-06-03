import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { Toaster } from "react-hot-toast";
import { ProtectedRoute } from "./components/ProtectedRoute";

import { LoginPage }         from "./pages/LoginPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import DashboardPage         from "./routes/DashboardPage";
import AiValidationPage      from "./routes/AiValidationPage";
import TokenUsagePage        from "./routes/TokenUsagePage";
import ClientsPage           from "./routes/ClientsPage";
import LeadJourneyPage       from "./routes/LeadJourneyPage";
import SchedulingPage        from "./routes/SchedulingPage";
import IngestMeetingPage     from "./routes/IngestMeetingPage";
import MeetingsPage          from "./routes/MeetingsPage";
import ClientJourneyPage     from "./routes/ClientJourneyPage";
import EmailTrackerPage      from "./routes/EmailTrackerPage";
import TasksPage             from "./routes/TasksPage";
import ManageAdvisorsPage    from "./routes/ManageAdvisorsPage";
import ManageTeamPage        from "./routes/ManageTeamPage";
import ManageTagsPage        from "./routes/ManageTagsPage";
import ManageMilestonesPage  from "./routes/ManageMilestonesPage";
import PlaceholderModule     from "./components/shared/PlaceholderModule";

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        reverseOrder={false}
        containerStyle={{ zIndex: 99999 }}
      />
      <Routes>
        <Route path="/login"         element={<LoginPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/auth/error"    element={<OAuthCallbackPage />} />
        <Route index                 element={<Navigate to="/login" replace />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clients"           element={<ClientsPage />} />
            <Route path="lead-journey"      element={<LeadJourneyPage />} />
            <Route path="ai-validation"     element={<AiValidationPage />} />
            <Route path="token-usage"       element={<TokenUsagePage />} />
            <Route path="scheduling"        element={<SchedulingPage />} />
            <Route path="ingest"            element={<IngestMeetingPage />} />
            <Route path="tasks"             element={<TasksPage />} />
            <Route path="meetings"          element={<MeetingsPage />} />
            <Route path="client-journey"    element={<ClientJourneyPage />} />
            <Route path="email-tracker"     element={<EmailTrackerPage />} />
            <Route path="manage-advisors"   element={<ManageAdvisorsPage />} />
            <Route path="manage-team"       element={<ManageTeamPage />} />
            <Route path="manage-milestones" element={<ManageMilestonesPage />} />
            <Route path="manage-tags"       element={<ManageTagsPage />} />
            <Route path="manage-membership" element={<PlaceholderModule title="Manage Membership" />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}
