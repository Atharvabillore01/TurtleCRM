import React, { useEffect, useState } from "react";
import SchedulingView from "../components/scheduling/SchedulingView";
import SchedulingModal from "../components/scheduling/SchedulingModal";
import { createEmptySchedulingForm } from "../data/mockData";
import { buildDateTime } from "../utils/dateTime";
import {
  fetchClients,
  fetchAdvisors,
  fetchMeetings,
  scheduleMeeting,
  fetchAvailableAgents,
  AgentOption,
} from "../api/meetingApi";
import { useAuth } from "../hooks/useAuth.js";

function meetingRecordToRow(m: any) {
  const dt = new Date(m.scheduled_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()}`;
  const hours = dt.getHours();
  const mins = pad(dt.getMinutes());
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const statusMap: Record<string, string> = {
    scheduled: "Upcoming",
    cancelled: "Canceled",
    completed: "Completed",
    transcribed: "Completed",
    extraction_completed: "Completed",
  };
  const advisorDisplay = (m.advisor_names && m.advisor_names.length > 0)
    ? m.advisor_names.join(" & ")
    : (m.advisor_name || m.advisor_id);

  return {
    id: m.id,
    title: m.title || m.agenda,
    clientNames: m.client_name || m.client_id,
    bookedBy: m.member || m.created_by || "",
    member: m.member || m.created_by || "—",
    advisor: advisorDisplay,
    advisorIds: m.advisor_ids || [m.advisor_id],
    advisorNames: m.advisor_names || [m.advisor_name || m.advisor_id],
    guests: m.guests || [],
    notes: m.notes || "",
    duration: m.duration_minutes,
    meetingUrl: m.meeting_url || "",
    extractionStatus: m.extraction_status || "",
    datetime: `${date} ${h12}:${mins} ${ampm}`,
    status: statusMap[m.status] ?? "Upcoming",
  };
}

export default function SchedulingPage() {
  const { userId } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<any>(createEmptySchedulingForm);
  const [clientOptions, setClientOptions] = useState<any[]>([]);
  const [advisorOptions, setAdvisorOptions] = useState<any[]>([]);
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetchMeetings()
      .then((data) => setRecords(data.map(meetingRecordToRow)))
      .catch(() => {
        // meeting-service unavailable — show empty list
      });
    fetchClients()
      .then((data) => setClientOptions(data))
      .catch(() => {});
    fetchAdvisors()
      .then((data) => setAdvisorOptions(data))
      .catch(() => {});
    fetchAvailableAgents()
      .then((data) => setAgentOptions(data))
      .catch(() => {});
  }, []);

  function toggleSelectedAgent(name: string) {
    setForm((current: any) => {
      const has = (current.selectedAgents || []).includes(name);
      return {
        ...current,
        selectedAgents: has
          ? current.selectedAgents.filter((a: string) => a !== name)
          : [...(current.selectedAgents || []), name],
      };
    });
  }

  function handleFieldChange(fieldId: any, value: any) {
    setForm((current: any) => ({ ...current, [fieldId]: value }));
  }

  async function handleSubmit(event: any) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const client = form.selectedClients[0];
    const advisors: any[] = form.selectedAdvisors;

    if (!client || advisors.length === 0) {
      setSubmitError("Please select at least one client and one advisor.");
      setIsSubmitting(false);
      return;
    }

    if (!form.date || !form.time) {
      setSubmitError("Please select a date and time for the meeting.");
      setIsSubmitting(false);
      return;
    }

    const primaryAdvisor = advisors[0];
    const scheduledAt = buildDateTime(form.date, form.time);

    try {
      const result = await scheduleMeeting({
        client_id: client.id,
        advisor_id: primaryAdvisor.id,
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(form.duration ?? "60", 10),
        agenda: form.agenda || form.title || "",
        created_by: userId || form.bookedBy || "internal-app",
        title: form.title || form.agenda || "",
        client_name: client.name,
        advisor_name: advisors.map((a: any) => a.name).join(" & "),
        client_email: client.email || "",
        advisor_email: primaryAdvisor.email || "",
        advisor_ids: advisors.map((a: any) => a.id),
        advisor_names: advisors.map((a: any) => a.name),
        advisor_emails: advisors.map((a: any) => a.email || "").filter(Boolean),
        member: form.member || form.bookedBy || "",
        guests: form.guests || [],
        notes: form.detailsHappened || "",
        agents_to_use: form.selectedAgents || [],
      });

      // Refresh list from service so the new meeting appears with its real ID
      const updated = await fetchMeetings();
      setRecords(updated.map(meetingRecordToRow));
      setForm(createEmptySchedulingForm());
      setIsModalOpen(false);
    } catch (err: any) {
      setSubmitError(err.message ?? "Failed to schedule meeting. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClientToggle(client: any) {
    setForm((current: any) => {
      const exists = current.selectedClients.some((item: any) => item.id === client.id);
      return {
        ...current,
        selectedClients: exists
          ? current.selectedClients.filter((item: any) => item.id !== client.id)
          : [...current.selectedClients, client],
      };
    });
  }

  function handleAdvisorToggle(advisor: any) {
    setForm((current: any) => {
      const exists = current.selectedAdvisors.some((item: any) => item.id === advisor.id);
      return {
        ...current,
        selectedAdvisors: exists
          ? current.selectedAdvisors.filter((item: any) => item.id !== advisor.id)
          : [...current.selectedAdvisors, advisor],
      };
    });
  }

  function handleAddGuest() {
    const nextGuest = form.guestInput.trim();
    if (!nextGuest) return;
    setForm((current: any) => ({
      ...current,
      guestInput: "",
      guests: current.guests.includes(nextGuest)
        ? current.guests
        : [...current.guests, nextGuest],
    }));
  }

  function handleRemoveGuest(guest: any) {
    setForm((current: any) => ({
      ...current,
      guests: current.guests.filter((item: any) => item !== guest),
    }));
  }

  return (
    <>
      <SchedulingView
        records={records}
        schedulingSearch={search}
        setSchedulingSearch={setSearch}
        onOpenModal={() => setIsModalOpen(true)}
      />

      {isModalOpen && (
        <SchedulingModal
          formValues={form}
          onChange={handleFieldChange}
          clientOptions={clientOptions.filter((client: any) =>
            client.name.toLowerCase().includes(form.clientSearch.trim().toLowerCase()),
          )}
          advisorOptions={advisorOptions.filter((advisor: any) =>
            advisor.name.toLowerCase().includes(form.advisorSearch.trim().toLowerCase()),
          )}
          onToggleClient={handleClientToggle}
          onToggleAdvisor={handleAdvisorToggle}
          onAddGuest={handleAddGuest}
          onRemoveGuest={handleRemoveGuest}
          agentOptions={agentOptions}
          onToggleAgent={toggleSelectedAgent}
          onClose={() => {
            setIsModalOpen(false);
            setForm(createEmptySchedulingForm());
            setSubmitError(null);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}
    </>
  );
}
