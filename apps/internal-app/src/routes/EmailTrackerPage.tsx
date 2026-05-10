import React, { useState } from "react";
import EmailTrackerView from "../components/email-tracker/EmailTrackerView";
import { initialEmailTrackerEntries } from "../data/mockData";

export default function EmailTrackerPage() {
  const [emails] = useState(initialEmailTrackerEntries);

  return <EmailTrackerView emails={emails} />;
}
