export function initials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function createSchedulingRecordFromForm(formValues, buildDateTime) {
  const clientNames = formValues.selectedClients.map((client) => client.name).join(", ");
  const advisorNames = formValues.selectedAdvisors.map((advisor) => advisor.name).join(", ");

  return {
    title: formValues.title || "Untitled call",
    member: formValues.member || formValues.bookedBy,
    advisor: advisorNames,
    datetime: buildDateTime(formValues.date, formValues.time),
    status: formValues.status || "Upcoming",
    bookedBy: formValues.bookedBy,
    clientNames,
    agenda: formValues.agenda,
    guests: formValues.guests.join(", "),
    detailsHappened: formValues.detailsHappened,
  };
}
