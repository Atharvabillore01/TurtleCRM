import React, { useState } from "react";
import ManageTeamView from "../components/manage-team/ManageTeamView";
import { initialTeamMembers } from "../data/mockData";

export default function ManageTeamPage() {
  const [teamMembers, setTeamMembers] = useState(initialTeamMembers);

  function handleCreateMember(memberForm: any) {
    setTeamMembers((current) => [
      { id: `TM-${String(current.length + 1001)}`, ...memberForm },
      ...current,
    ]);
  }

  function handleUpdateMember(updatedMember: any) {
    setTeamMembers((current) =>
      current.map((member) =>
        member.id === updatedMember.id ? updatedMember : member,
      ),
    );
  }

  function handleDeleteMember(memberId: any) {
    setTeamMembers((current) => current.filter((member) => member.id !== memberId));
  }

  return (
    <ManageTeamView
      members={teamMembers}
      onCreateMember={handleCreateMember}
      onUpdateMember={handleUpdateMember}
      onDeleteMember={handleDeleteMember}
    />
  );
}
