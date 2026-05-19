import React from "react";
import SearchableMultiPicker from "./SearchableMultiPicker";

export default function SchedulingModal({
  formValues,
  onChange,
  onClose,
  onSubmit,
  clientOptions,
  advisorOptions,
  onToggleClient,
  onToggleAdvisor,
  onAddGuest,
  onRemoveGuest,
  isSubmitting,
  submitError,
}: any) {
  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(880px,100%)] max-h-[calc(100vh-48px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduling-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[22px] pt-5 pb-[18px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Scheduling</p>
            <h2 id="scheduling-modal-title">Add new meeting</h2>
            <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
              Create a scheduling record with the ops team member, advisor, meeting date and current status.
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink text-[15px] font-black font-montserrat leading-none cursor-pointer"
            type="button"
            onClick={onClose}
            aria-label="Close add meeting form"
          >
            {"✕"}
          </button>
        </div>

        <form className="grid grid-cols-2 gap-[14px] px-[22px] pt-5 pb-[22px] mobile:grid-cols-1" onSubmit={onSubmit}>
          <div className="col-span-2 flex items-start justify-between gap-4 px-[18px] py-4 border border-[rgba(46,222,190,0.22)] rounded-2xl bg-gradient-to-b from-[#f7fffd] to-[#eefcf8] mobile:col-span-1 mobile:flex-col">
            <div>
              <span className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase">Booked By</span>
              <strong className="block">{formValues.bookedBy || "Ops team member"}</strong>
              <p className="mt-1.5 text-muted text-[13px] m-0">
                Name: {formValues.bookedBy || "Enter below"} | Status: {formValues.status}
              </p>
            </div>
            <span className="inline-flex items-center min-h-[26px] px-[10px] rounded-full bg-[#138773] text-white text-[11px] font-black">
              YOU
            </span>
          </div>

          <label className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">Booked by</span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              value={formValues.bookedBy}
              onChange={(event) => onChange("bookedBy", event.target.value)}
              placeholder="Person name"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Member</span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              value={formValues.member}
              onChange={(event) => onChange("member", event.target.value)}
              placeholder="Ops team member"
            />
          </label>

          <div className="col-span-2 grid gap-1 px-4 py-[14px] border border-line rounded-[14px] bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white mobile:col-span-1">
            <span className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase">Client &amp; advisors</span>
            <strong className="text-lg font-comfortaa">Selection</strong>
          </div>

          <SearchableMultiPicker
            label="Client"
            placeholder="Search and select client..."
            items={clientOptions}
            selectedItems={formValues.selectedClients}
            search={formValues.clientSearch}
            onSearchChange={(value: any) => onChange("clientSearch", value)}
            onToggleItem={onToggleClient}
          />

          <SearchableMultiPicker
            label="Advisors (multi-select)"
            placeholder="Search and select advisors..."
            items={advisorOptions}
            selectedItems={formValues.selectedAdvisors}
            search={formValues.advisorSearch}
            onSearchChange={(value: any) => onChange("advisorSearch", value)}
            onToggleItem={onToggleAdvisor}
          />

          <div className="col-span-2 grid gap-1 px-4 py-[14px] border border-line rounded-[14px] bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white mobile:col-span-1">
            <span className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase">Call details</span>
            <strong className="text-lg font-comfortaa">Meeting setup</strong>
          </div>

          <label className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">Title</span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              value={formValues.title}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder="Select or type a custom title..."
            />
          </label>

          <label className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">Agenda</span>
            <textarea
              className="form-field w-full min-h-[112px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              value={formValues.agenda}
              onChange={(event) => onChange("agenda", event.target.value)}
              rows={3}
              placeholder="Enter agenda..."
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Date</span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              type="date"
              value={formValues.date}
              onChange={(event) => onChange("date", event.target.value)}
            />
          </label>

          <div className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Start time</span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              type="time"
              value={formValues.time}
              onChange={(event) => onChange("time", event.target.value)}
            />
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Duration</span>
            <select value={formValues.duration} onChange={(event) => onChange("duration", event.target.value)}>
              {["15", "30", "45", "60", "90"].map((duration) => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Status</span>
            <select value={formValues.status} onChange={(event) => onChange("status", event.target.value)}>
              <option value="Upcoming">Upcoming</option>
              <option value="Completed">Completed</option>
              <option value="Canceled">Canceled</option>
            </select>
          </label>

          <label className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">
              Google Meet URL
              <span className="ml-2 normal-case font-normal text-muted">
                — paste the Meet link so Fireflies bot can auto-join and record
              </span>
            </span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              type="url"
              value={formValues.meetingUrl}
              onChange={(event) => onChange("meetingUrl", event.target.value)}
              placeholder="https://meet.google.com/xxx-yyyy-zzz"
            />
          </label>

          <div className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">Guests (optional)</span>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-[10px] mobile:grid-cols-1">
              <input
                className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
                value={formValues.guestInput}
                onChange={(event) => onChange("guestInput", event.target.value)}
                placeholder="Enter guest email and press Add"
              />
              <button
                className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                type="button"
                onClick={onAddGuest}
              >
                Add
              </button>
            </div>
            {formValues.guests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formValues.guests.map((guest: any) => (
                  <button
                    className="inline-flex items-center gap-2 min-h-[34px] px-3 border border-[rgba(46,222,190,0.35)] rounded-full bg-[#d8fff6] text-[#0f6e5d] text-xs font-extrabold cursor-pointer"
                    key={guest}
                    type="button"
                    onClick={() => onRemoveGuest(guest)}
                  >
                    <span>{guest}</span>
                    <strong className="text-xs">{"✕"}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="col-span-2 grid gap-2 mobile:col-span-1">
            <span className="text-xs font-extrabold text-muted uppercase">All details that happened</span>
            <textarea
              className="form-field w-full min-h-[112px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              value={formValues.detailsHappened}
              onChange={(event) => onChange("detailsHappened", event.target.value)}
              rows={5}
            />
          </label>

          <div className="col-span-2 flex items-center justify-end gap-3 mt-2 pt-[6px] border-t border-[rgba(215,239,234,0.9)] mobile:col-span-1">
            <button
              className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer disabled:opacity-50"
              type="submit"
              disabled={!!isSubmitting}
            >
              {isSubmitting ? "Scheduling…" : "Add meeting"}
            </button>
          </div>
          {submitError && (
            <p className="text-red-600 text-sm mt-2">{submitError}</p>
          )}
        </form>
      </div>
    </div>
  );
}
