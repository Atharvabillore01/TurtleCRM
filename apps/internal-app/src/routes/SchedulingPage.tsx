import React, { useState } from "react";
import SchedulingView from "../components/scheduling/SchedulingView";
import SchedulingModal from "../components/scheduling/SchedulingModal";
import {
  initialSchedulingRecords,
  createEmptySchedulingForm,
  schedulingAdvisorOptions,
  schedulingClientOptions,
} from "../data/mockData";
import { buildDateTime } from "../utils/dateTime";
import { createSchedulingRecordFromForm } from "../utils/formatters";

export default function SchedulingPage() {
  const [records, setRecords] = useState(initialSchedulingRecords);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<any>(createEmptySchedulingForm);

  function handleFieldChange(fieldId: any, value: any) {
    setForm((current: any) => ({ ...current, [fieldId]: value }));
  }

  function handleSubmit(event: any) {
    event.preventDefault();
    const newRecord = {
      id: `SCH-${String(records.length + 1001)}`,
      ...createSchedulingRecordFromForm(form, buildDateTime),
    };
    setRecords((current: any) => [newRecord, ...current]);
    setForm(createEmptySchedulingForm());
    setIsModalOpen(false);
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
          clientOptions={schedulingClientOptions.filter((client: any) =>
            client.name.toLowerCase().includes(form.clientSearch.trim().toLowerCase()),
          )}
          advisorOptions={schedulingAdvisorOptions.filter((advisor: any) =>
            advisor.name.toLowerCase().includes(form.advisorSearch.trim().toLowerCase()),
          )}
          onToggleClient={handleClientToggle}
          onToggleAdvisor={handleAdvisorToggle}
          onAddGuest={handleAddGuest}
          onRemoveGuest={handleRemoveGuest}
          onClose={() => {
            setIsModalOpen(false);
            setForm(createEmptySchedulingForm());
          }}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
