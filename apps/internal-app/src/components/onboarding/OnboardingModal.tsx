import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  LockPasswordIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

const SERVICE_OPTIONS = [
  "Tax Filing",
  "Tax Planning",
  "Financial Planning",
  "Insurance",
  "Investment Advisory",
  "NRI Services",
];

export default function OnboardingModal({ formValues, onChange, onClose, onSubmit }: any) {
  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(680px,100%)] max-h-[calc(100vh-48px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[22px] pt-5 pb-[18px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px]">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">KC Booking</p>
            <h2 id="onboarding-modal-title">Convert to client</h2>
            <p className="max-w-[520px] mt-2 text-muted text-sm leading-[1.6] m-0">
              Lead details are auto-filled from KC booking. Set the account password and services opted to complete onboarding.
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft shrink-0"
            type="button"
            onClick={onClose}
            aria-label="Close onboarding form"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2.5} />
          </button>
        </div>

        <form className="grid grid-cols-2 gap-[14px] px-[22px] pt-5 pb-[22px] mobile:grid-cols-1" onSubmit={onSubmit}>

          {/* Auto-filled read-only fields */}
          <div className="col-span-2 px-4 py-3 border border-[rgba(46,222,190,0.22)] rounded-xl bg-[rgba(245,255,252,0.72)] mobile:col-span-1">
            <p className="text-green-dark text-[11px] font-black tracking-[0.08em] uppercase m-0 mb-2">Auto-filled from KC booking</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mobile:grid-cols-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted font-semibold min-w-[80px]">Name</span>
                <strong className="text-ink">{formValues.fullName || "—"}</strong>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted font-semibold min-w-[80px]">Email</span>
                <span className="text-ink break-all">{formValues.email || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted font-semibold min-w-[80px]">Phone</span>
                <span className="text-ink">{formValues.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted font-semibold min-w-[80px]">Client type</span>
                <span className="text-ink">{formValues.clientType || "—"}</span>
              </div>
            </div>
          </div>

          {/* Services opted */}
          <label className="grid gap-2">
            <span className="text-xs font-extrabold text-muted uppercase">Services opted</span>
            <select
              value={formValues.serviceOpted}
              onChange={(event) => onChange("serviceOpted", event.target.value)}
              required
            >
              <option value="">Select a service</option>
              {SERVICE_OPTIONS.map((service) => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </label>

          {/* Password */}
          <label className="grid gap-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold text-muted uppercase">
              <HugeiconsIcon icon={LockPasswordIcon} size={12} strokeWidth={2.5} />
              Create password
            </span>
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
              type="password"
              value={formValues.password}
              onChange={(event) => onChange("password", event.target.value)}
              placeholder="Set account password"
              autoComplete="new-password"
              required
            />
          </label>

          {/* Footer */}
          <div className="col-span-2 flex items-center justify-end gap-3 pt-4 border-t border-[rgba(215,239,234,0.9)] mobile:col-span-1">
            <button
              className="inline-flex items-center gap-1.5 min-h-[36px] px-4 border border-line rounded-lg bg-white text-ink text-sm font-black cursor-pointer hover:bg-surface-soft"
              type="button"
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.5} />
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 min-h-[36px] px-4 border border-green rounded-lg bg-green text-ink text-sm font-black cursor-pointer transition-transform active:scale-[0.98]"
              type="submit"
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2.5} />
              Confirm conversion
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
