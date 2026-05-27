import React, { useState } from "react";
import LeadJourneyView from "../components/lead-journey/LeadJourneyView";
import LeadJourneyModal from "../components/lead-journey/LeadJourneyModal";
import LeadModal from "../components/leads/LeadModal";
import OnboardingModal from "../components/onboarding/OnboardingModal";
import {
  initialLeads,
  initialOnboardingProspects,
  createEmptyLeadForm,
} from "../data/mockData";

const SERVICE_OPTIONS = [
  "Tax Filing",
  "Tax Planning",
  "Financial Planning",
  "Insurance",
  "Investment Advisory",
  "NRI Services",
];
void SERVICE_OPTIONS;

function buildInitialRecords() {
  return [
    ...(initialLeads as any[]).map((lead: any) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone || "",
      clientType: lead.type || "",
      owner: lead.kcTakerName || "",
      notes: lead.remark || "",
      source: "Lead Entry",
      stage: "Lead",
    })),
    ...(initialOnboardingProspects as any[]).map((prospect: any) => ({
      id: prospect.id,
      name: prospect.fullName,
      email: prospect.email,
      phone: prospect.phone || "",
      clientType: prospect.clientType || "",
      owner: prospect.assignedTo || "",
      notes: prospect.note || "",
      source: prospect.source || "Onboarding",
      stage: prospect.status === "Deadpool" ? "Dead Prospect" : "Prospect",
    })),
  ];
}

function createEmptyOnboardingForm(prefill: any = {}) {
  return {
    fullName: prefill.name || "",
    email: prefill.email || "",
    phone: prefill.phone || "",
    clientType: prefill.clientType || "",
    serviceOpted: "",
    password: "",
  };
}

export default function LeadJourneyPage() {
  const [records, setRecords] = useState(buildInitialRecords);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<any>(createEmptyLeadForm);
  const [convertingLead, setConvertingLead] = useState<any>(null);
  const [onboardingForm, setOnboardingForm] = useState(() => createEmptyOnboardingForm());

  function handleLeadFieldChange(fieldId: any, value: any) {
    setLeadForm((current: any) => ({ ...current, [fieldId]: value }));
  }

  function handleLeadSubmit(event: any) {
    event.preventDefault();
    const nextId = `LD-${String(records.length + 1001)}`;
    setRecords((current: any) => [
      {
        id: nextId,
        name: leadForm.name,
        email: leadForm.email,
        phone: leadForm.phone || "",
        clientType: leadForm.type || "",
        owner: leadForm.kcTakerName || "",
        notes: leadForm.remark || "",
        source: "Lead Entry",
        stage: "Lead",
      },
      ...current,
    ]);
    setLeadForm(createEmptyLeadForm());
    setIsLeadModalOpen(false);
  }

  function handleLeadModalClose() {
    setIsLeadModalOpen(false);
    setLeadForm(createEmptyLeadForm());
  }

  function handleJourneyLeadSave(updatedRecord: any) {
    setRecords((current: any) =>
      current.map((r: any) => (r.id === updatedRecord.id ? updatedRecord : r)),
    );
    setSelectedLead(updatedRecord);
  }

  function handleConvert(leadRecord: any) {
    setOnboardingForm(createEmptyOnboardingForm(leadRecord));
    setConvertingLead(leadRecord);
    setSelectedLead(null);
  }

  function handleOnboardingChange(fieldId: any, value: any) {
    setOnboardingForm((current: any) => ({ ...current, [fieldId]: value }));
  }

  function handleOnboardingSubmit(event: any) {
    event.preventDefault();
    if (!convertingLead) return;
    setRecords((current: any) =>
      current.map((r: any) =>
        r.id === convertingLead.id ? { ...r, stage: "Converted" } : r,
      ),
    );
    setConvertingLead(null);
    setOnboardingForm(createEmptyOnboardingForm());
  }

  function handleOnboardingClose() {
    setConvertingLead(null);
    setOnboardingForm(createEmptyOnboardingForm());
  }

  return (
    <>
      <LeadJourneyView
        records={records}
        search={search}
        setSearch={setSearch}
        onOpenAddLead={() => {
          setLeadForm(createEmptyLeadForm());
          setIsLeadModalOpen(true);
        }}
        onSelectLead={setSelectedLead}
      />

      {isLeadModalOpen && (
        <LeadModal
          formValues={leadForm}
          onChange={handleLeadFieldChange}
          onClose={handleLeadModalClose}
          onSubmit={handleLeadSubmit}
          mode="create"
        />
      )}

      {selectedLead && (
        <LeadJourneyModal
          record={selectedLead}
          onClose={() => setSelectedLead(null)}
          onSave={handleJourneyLeadSave}
          onConvert={handleConvert}
        />
      )}

      {convertingLead && (
        <OnboardingModal
          formValues={onboardingForm}
          onChange={handleOnboardingChange}
          onClose={handleOnboardingClose}
          onSubmit={handleOnboardingSubmit}
        />
      )}
    </>
  );
}
