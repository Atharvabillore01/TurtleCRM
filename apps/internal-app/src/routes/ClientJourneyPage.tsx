import React, { useState } from "react";
import ClientJourneyView from "../components/client-journey/ClientJourneyView";
import { initialClientJourneyRows } from "../data/mockData";

export default function ClientJourneyPage() {
  const [rows] = useState(initialClientJourneyRows);

  return <ClientJourneyView rows={rows} />;
}
