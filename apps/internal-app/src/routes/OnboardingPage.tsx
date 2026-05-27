import React, { useState } from "react";
import OnboardingView from "../components/onboarding/OnboardingView";
import OnboardingModal from "../components/onboarding/OnboardingModal";
import { initialOnboardingProspects, kcBookingClients } from "../data/mockData";

function createEmptyOnboardingForm() {
  return {
    source: "",
    bookingSearch: "",
    selectedBookingId: "",
    fullName: "",
    email: "",
    phone: "",
    clientType: "",
    assignedTo: "",
    serviceOpted: "",
    password: "",
    note: "",
    status: "Prospect",
  };
}

export default function OnboardingPage() {
  const [prospects, setProspects] = useState(initialOnboardingProspects);
  const [onboardingSearch, setOnboardingSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(createEmptyOnboardingForm);

  function handleChange(fieldId: any, value: any) {
    setForm((current) => ({ ...current, [fieldId]: value }));
  }

  function handleSelectSource(source: any) {
    setForm((current) => ({ ...current, source }));
  }

  function handleSubmit(event: any) {
    event.preventDefault();
    const newProspect = {
      id: `ONB-${String(prospects.length + 1001)}`,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      clientType: form.clientType,
      assignedTo: form.assignedTo,
      source: form.source,
      serviceOpted: form.serviceOpted,
      status: "Prospect",
      note: form.note,
    };
    setProspects((current) => [newProspect, ...current]);
    setForm(createEmptyOnboardingForm());
    setIsModalOpen(false);
  }

  function handleClose() {
    setIsModalOpen(false);
    setForm(createEmptyOnboardingForm());
  }

  // Filter KC booking clients based on search
  const bookingOptions = kcBookingClients.filter((client) => {
    const q = form.bookingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      client.name.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q) ||
      client.clientType.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <OnboardingView
        prospects={prospects}
        onboardingSearch={onboardingSearch}
        setOnboardingSearch={setOnboardingSearch}
        onOpenModal={() => setIsModalOpen(true)}
      />

      {isModalOpen && (
        <OnboardingModal
          formValues={form}
          onChange={handleChange}
          onSelectSource={handleSelectSource}
          onClose={handleClose}
          onSubmit={handleSubmit}
          bookingOptions={bookingOptions}
        />
      )}
    </>
  );
}
