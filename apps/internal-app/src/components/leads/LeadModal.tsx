import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { leadFields } from "../../data/mockData";

const serviceOptions = [
  "Tax Filing",
  "Tax Planning",
  "Financial Planning",
  "Insurance",
  "Investment Advisory",
  "NRI Services",
];

function renderField(field: any, formValues: any, onChange: any) {
  if (field.id === "remark") {
    return (
      <textarea
        className="form-field w-full min-h-[112px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
        value={formValues[field.id]}
        onChange={(event) => onChange(field.id, event.target.value)}
        rows={4}
      />
    );
  }

  if (field.id === "type") {
    return (
      <select value={formValues[field.id]} onChange={(event) => onChange(field.id, event.target.value)}>
        <option value="">Select type</option>
        <option value="Indian">Indian</option>
        <option value="NRI">NRI</option>
      </select>
    );
  }

  if (field.id === "serviceOpted") {
    return (
      <select value={formValues[field.id]} onChange={(event) => onChange(field.id, event.target.value)}>
        <option value="">Select service</option>
        {serviceOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
      value={formValues[field.id]}
      onChange={(event) => onChange(field.id, event.target.value)}
    />
  );
}

export default function LeadModal({ formValues, onChange, onClose, onSubmit, mode = "create" }: any) {
  const isDetailsMode = mode === "details";

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(880px,100%)] max-h-[calc(100vh-48px)] overflow-auto scrollbar-hidden border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[22px] pt-5 pb-[18px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">{isDetailsMode ? "Client popup" : "Manual entry"}</p>
            <h2 id="lead-modal-title">{isDetailsMode ? "Client lead details" : "Add new lead"}</h2>
            <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
              {isDetailsMode
                ? "Review the selected client details and fill the empty fields like password or services opted."
                : "Create a lead record with the requested table fields so the row is ready for follow-up immediately."}
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={onClose}
            aria-label={isDetailsMode ? "Close client lead details" : "Close add lead form"}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
          </button>
        </div>

        <form className="grid grid-cols-2 gap-[14px] px-[22px] pt-5 pb-[22px] mobile:grid-cols-1" onSubmit={onSubmit}>
          <div className="col-span-2 grid gap-1 px-4 py-[14px] border border-line rounded-[14px] bg-gradient-to-b from-[rgba(245,255,252,0.95)] to-white mobile:col-span-1">
            <span className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase">Lead details</span>
            <strong className="text-lg font-comfortaa">{isDetailsMode ? "Client profile" : "Primary info"}</strong>
          </div>

          {leadFields.map((field: any) => (
            <label
              className={`grid gap-2 ${field.id === "remark" ? "col-span-2 mobile:col-span-1" : ""}`}
              key={field.id}
            >
              <span className="text-xs font-extrabold text-muted uppercase">{field.label}</span>
              {renderField(field, formValues, onChange)}
            </label>
          ))}

          <div className="col-span-2 flex items-center justify-end gap-3 mt-2 pt-[6px] border-t border-[rgba(215,239,234,0.9)] mobile:col-span-1">
            <button
              className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
              type="button"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} />
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 min-h-10 px-4 border border-green rounded-lg bg-green text-ink font-black cursor-pointer transition-transform active:scale-[0.98]"
              type="submit"
            >
              <HugeiconsIcon
                icon={isDetailsMode ? CheckmarkCircle02Icon : UserGroupIcon}
                size={16}
                strokeWidth={2.5}
              />
              {isDetailsMode ? "Save details" : "Add lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
