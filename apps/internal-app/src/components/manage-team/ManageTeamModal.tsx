import React, { useEffect, useMemo, useState } from "react";

const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];
const salutationOptions = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
const departmentOptions = ["Operations", "Client Success", "Advisory", "Sales", "Finance", "Admin"];
const roleOptions = ["Team Lead", "Manager", "Senior Associate", "Associate", "Coordinator", "Executive"];

function toDraft(member: any) {
  if (!member) {
    return {
      profileImage: "",
      fullName: "",
      salutation: "Mr.",
      password: "",
      gender: "Male",
      countryCode: "+91",
      phoneNo: "",
      phone2: "",
      email: "",
      department: "Operations",
      role: "Associate",
      displayRole: "",
    };
  }

  return {
    profileImage: member.profileImage || "",
    fullName: member.fullName || "",
    salutation: member.salutation || "Mr.",
    password: member.password || "",
    gender: member.gender || "Male",
    countryCode: member.countryCode || "+91",
    phoneNo: member.phoneNo || "",
    phone2: member.phone2 || "",
    email: member.email || "",
    department: member.department || "Operations",
    role: member.role || "Associate",
    displayRole: member.displayRole || "",
  };
}

function getInitials(name: any) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part: any) => part[0])
    .join("")
    .toUpperCase();
}

export default function ManageTeamModal({ mode, member, onClose, onCreate, onSave }: any) {
  const [draft, setDraft] = useState(() => toDraft(member));

  useEffect(() => {
    setDraft(toDraft(member));
  }, [member, mode]);

  const heading = mode === "create" ? "Add team member" : mode === "edit" ? "Edit team member" : "Team member details";
  const cta = mode === "create" ? "Create member" : mode === "edit" ? "Save changes" : "Close";
  const avatarText = useMemo(() => getInitials(draft.fullName), [draft.fullName]);

  function handleImagePick(event: any) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({ ...current, profileImage: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: any) {
    event.preventDefault();

    if (mode === "view") {
      onClose();
      return;
    }

    const payload = {
      ...(member || {}),
      ...draft,
    };

    if (mode === "create") {
      onCreate(payload);
      return;
    }

    onSave(payload);
  }

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(980px,100%)] max-h-[calc(100vh-32px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[22px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[18px] pt-4 pb-[14px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Manage team</p>
            <h2 id="team-modal-title">{heading}</h2>
            <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
              {mode === "create"
                ? "Add a new team member with contact details, role, and department."
                : mode === "edit"
                  ? "Update the team member profile and keep the directory in sync."
                  : "Review the team member details before returning to the table."}
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
            type="button"
            onClick={onClose}
            aria-label="Close team dialog"
          >
            X
          </button>
        </div>

        {mode === "view" ? (
          <div className="grid gap-4 px-[18px] pt-4 pb-[18px]">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[14px] mobile:grid-cols-1">
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Profile image</span>
                <div className="flex items-center gap-3">
                  {draft.profileImage ? (
                    <img
                      src={draft.profileImage}
                      alt={draft.fullName}
                      className="h-14 w-14 rounded-full object-cover border border-[rgba(46,222,190,0.25)]"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full grid place-items-center bg-[rgba(46,222,190,0.12)] text-[#137765] font-black">
                      {avatarText || "T"}
                    </div>
                  )}
                  <strong>{draft.fullName}</strong>
                </div>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Email</span>
                <strong className="break-all">{draft.email}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Department</span>
                <strong>{draft.department}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Role</span>
                <strong>{draft.role}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Contact</span>
                <strong>
                  {draft.countryCode} {draft.phoneNo}
                </strong>
                {draft.phone2 ? <span className="text-muted text-sm">{draft.phone2}</span> : <span className="text-muted text-sm">No second phone number</span>}
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Display role</span>
                <strong className="leading-[1.6]">{draft.displayRole || "No display role added."}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Salutation</span>
                <strong>{draft.salutation}</strong>
              </article>
              <article className="grid gap-2 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white">
                <span className="text-xs font-extrabold text-muted uppercase">Password</span>
                <strong>{draft.password ? "********" : "Not set"}</strong>
              </article>
            </div>

            <div className="flex items-center justify-end gap-3 pt-[6px] border-t border-[rgba(215,239,234,0.9)]">
              <button
                className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                type="button"
                onClick={onClose}
              >
                {cta}
              </button>
            </div>
          </div>
        ) : (
          <form className="grid grid-cols-2 gap-[12px] px-[18px] pt-4 pb-[18px] mobile:grid-cols-1" onSubmit={handleSubmit}>
            <div className="col-span-2 grid gap-3 p-4 border border-line rounded-2xl bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white mobile:col-span-1">
              <div className="flex items-center gap-4 mobile:flex-col mobile:items-start">
                {draft.profileImage ? (
                  <img
                    src={draft.profileImage}
                    alt={draft.fullName || "Team preview"}
                    className="h-16 w-16 rounded-full object-cover border border-[rgba(46,222,190,0.25)]"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full grid place-items-center bg-[rgba(46,222,190,0.12)] text-[#137765] font-black">
                    {avatarText || "T"}
                  </div>
                )}

                <div className="grid gap-2 flex-1">
                  <span className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase">Profile image</span>
                  <input
                    className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                    type="file"
                    accept="image/*"
                    onChange={handleImagePick}
                  />
                  <span className="text-muted text-xs">Upload a profile image or leave it blank to use initials.</span>
                </div>
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Full name</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.fullName}
                onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Salutation</span>
              <select value={draft.salutation} onChange={(event) => setDraft((current) => ({ ...current, salutation: event.target.value }))}>
                {salutationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Gender</span>
              <select value={draft.gender} onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value }))}>
                {genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Email</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Password</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                type="password"
                value={draft.password}
                onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Country code</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.countryCode}
                onChange={(event) => setDraft((current) => ({ ...current, countryCode: event.target.value }))}
                placeholder="+91"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Phone no.</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.phoneNo}
                onChange={(event) => setDraft((current) => ({ ...current, phoneNo: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Phone 2</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.phone2}
                onChange={(event) => setDraft((current) => ({ ...current, phone2: event.target.value }))}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Department</span>
              <select value={draft.department} onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}>
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold text-muted uppercase">Role</span>
              <select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}>
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-2 grid gap-2 mobile:col-span-1">
              <span className="text-xs font-extrabold text-muted uppercase">Display role</span>
              <input
                className="form-field w-full min-h-[40px] px-3 py-[9px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={draft.displayRole}
                onChange={(event) => setDraft((current) => ({ ...current, displayRole: event.target.value }))}
                placeholder="Free text"
              />
            </label>

            <div className="col-span-2 flex items-center justify-end gap-3 mt-1 pt-[6px] border-t border-[rgba(215,239,234,0.9)] mobile:col-span-1">
              <button
                className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer" type="submit">
                {cta}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
