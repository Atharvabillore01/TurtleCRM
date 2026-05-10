import React, { useState } from "react";
import MeetingsView from "../components/meetings/MeetingsView";
import { initialMeetings } from "../data/mockData";

export default function MeetingsPage() {
  const [meetings] = useState(initialMeetings);

  return <MeetingsView meetings={meetings} />;
}
