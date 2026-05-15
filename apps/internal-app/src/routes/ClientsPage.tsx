import React, { useState } from "react";
import ClientsView from "../components/clients/ClientsView";
import { initialClients } from "../data/mockData";

export default function ClientsPage() {
  const [clients] = useState(initialClients);

  return <ClientsView clients={clients} />;
}
