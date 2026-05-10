import React, { useState } from "react";
import ManageAdvisorsView from "../components/manage-advisors/ManageAdvisorsView";
import { initialAdvisors } from "../data/mockData";

export default function ManageAdvisorsPage() {
  const [advisors, setAdvisors] = useState(initialAdvisors);

  function handleCreateAdvisor(advisorForm: any) {
    setAdvisors((current) => [
      { id: `ADV-${String(current.length + 1001)}`, ...advisorForm },
      ...current,
    ]);
  }

  function handleUpdateAdvisor(updatedAdvisor: any) {
    setAdvisors((current) =>
      current.map((advisor) =>
        advisor.id === updatedAdvisor.id ? updatedAdvisor : advisor,
      ),
    );
  }

  function handleDeleteAdvisor(advisorId: any) {
    setAdvisors((current) => current.filter((advisor) => advisor.id !== advisorId));
  }

  return (
    <ManageAdvisorsView
      advisors={advisors}
      onCreateAdvisor={handleCreateAdvisor}
      onUpdateAdvisor={handleUpdateAdvisor}
      onDeleteAdvisor={handleDeleteAdvisor}
    />
  );
}
