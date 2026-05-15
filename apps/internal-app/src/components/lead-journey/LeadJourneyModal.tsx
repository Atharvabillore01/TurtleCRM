import React, { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Edit02Icon,
  UserAccountIcon,
  ArrowDown01Icon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons";

const PIPELINE_STAGES = [
  {
    id: "Lead",
    label: "Lead",
    desc: "Not yet qualified",
    icon: UserAccountIcon,
    activeClass: "border-[rgba(100,149,237,0.5)] bg-[rgba(100,149,237,0.08)] text-[#3a5fa8]",
    iconBg: "bg-[rgba(100,149,237,0.14)]",
    dotColor: "bg-[#6495ed]",
    pillClass: "bg-[rgba(100,149,237,0.14)] text-[#3a5fa8]",
  },
  {
    id: "Prospect",
    label: "Prospect",
    desc: "Qualified, in progress",
    icon: ArrowRight01Icon,
    activeClass: "border-[rgba(255,193,87,0.5)] bg-[rgba(255,193,87,0.08)] text-[#946200]",
    iconBg: "bg-[rgba(255,193,87,0.18)]",
    dotColor: "bg-[#f5a623]",
    pillClass: "bg-[rgba(255,241,201,0.8)] text-[#946200]",
  },
  {
    id: "Converted",
    label: "Converted",
    desc: "Onboarding triggered",
    icon: CheckmarkCircle02Icon,
    activeClass: "border-green bg-[rgba(46,222,190,0.10)] text-[#137765]",
    iconBg: "bg-[rgba(46,222,190,0.16)]",
    dotColor: "bg-green",
    pillClass: "bg-[rgba(46,222,190,0.16)] text-[#137765]",
  },
];

const DEAD_STAGE = {
  id: "Dead Prospect",
  label: "Dead Prospect",
  desc: "Stopped or inactive",
  icon: MinusSignIcon,
  activeClass: "border-[rgba(196,196,196,0.9)] bg-[#f7f7f7] text-[#555]",
  iconBg: "bg-[rgba(0,0,0,0.06)]",
  dotColor: "bg-[#aaa]",
  pillClass: "bg-[#f0f0f0] text-[#555]",
};

function EditableFieldCard({
  label,
  field,
  value,
  draftValue,
  editingField,
  onStartEdit,
  onChange,
  onSave,
  onCancel,
  type = "text",
  options = [],
}: any) {
  const isEditing = editingField === field;

  return (
    <article className="grid gap-2 p-4 border border-line rounded-2xl bg-white">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-extrabold text-muted uppercase">{label}</span>
        {!isEditing ? (
          <button
            className="flex items-center justify-center min-w-[30px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={() => onStartEdit(field)}
            aria-label={`Edit ${label}`}
          >
            <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={2.5} color="currentColor" />
          </button>
        ) : null}
      </div>

      {!isEditing ? (
        <strong className={type === "textarea" ? "leading-[1.6]" : "break-all"}>{value || "-"}</strong>
      ) : (
        <div className="grid gap-2">
          {type === "select" ? (
            <select value={draftValue} onChange={(event) => onChange(field, event.target.value)}>
              <option value="">Select value</option>
              {options.map((option: any) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : type === "textarea" ? (
            <textarea
              className="form-field w-full min-h-[110px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white"
              value={draftValue}
              onChange={(event) => onChange(field, event.target.value)}
              rows={4}
            />
          ) : (
            <input
              className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white"
              type={type}
              value={draftValue}
              onChange={(event) => onChange(field, event.target.value)}
            />
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer hover:bg-surface-soft"
              type="button"
              onClick={onCancel}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2.5} color="currentColor" />
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-green rounded-lg bg-green text-ink text-xs font-black font-montserrat cursor-pointer transition-transform active:scale-95"
              type="button"
              onClick={() => onSave(field)}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} color="currentColor" />
              Save
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function LeadJourneyModal({ record, onClose, onSave, onConvert }: any) {
  const [draftRecord, setDraftRecord] = useState(record);
  const [editingField, setEditingField] = useState<any>(null);

  useEffect(() => {
    setDraftRecord(record);
    setEditingField(null);
  }, [record]);

  function handleFieldChange(field: any, value: any) {
    setDraftRecord((current: any) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleFieldSave(field: any) {
    onSave({
      ...record,
      [field]: draftRecord[field],
    });
    setEditingField(null);
  }

  function handleFieldCancel() {
    setDraftRecord(record);
    setEditingField(null);
  }

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center p-6 backdrop-blur-[10px] bg-[rgba(17,23,22,0.56)]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative z-[1001] w-[min(860px,100%)] max-h-[calc(100vh-48px)] overflow-auto border border-[rgba(215,239,234,0.9)] rounded-[24px] bg-white shadow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-journey-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 px-[22px] pt-5 pb-[18px] border-b border-[rgba(215,239,234,0.9)] bg-[rgba(255,255,255,0.92)] backdrop-blur-[12px] mobile:flex-col mobile:items-start">
          <div>
            <p className="text-green text-xs font-black uppercase font-montserrat m-0">Lead Journey</p>
            <div className="flex items-center gap-3">
              <h2 id="lead-journey-modal-title">{draftRecord.name}</h2>
              <button
                className="flex items-center justify-center min-w-[30px] min-h-[30px] border border-line rounded-lg bg-white text-ink cursor-pointer"
                type="button"
                onClick={() => setEditingField("name")}
                aria-label="Edit lead name"
              >
                <HugeiconsIcon icon={Edit02Icon} size={16} strokeWidth={1.8} color="currentColor" />
              </button>
            </div>
            <p className="max-w-[620px] mt-2 text-muted text-sm leading-[1.6] m-0">
              Update the lead stage here so it is immediately clear whether this person is still a lead, is now a prospect, has gone cold, or is converted.
            </p>
          </div>
          <button
            className="flex justify-center items-center min-w-[34px] min-h-[30px] border border-line rounded-lg bg-white text-ink transition-transform active:scale-95 cursor-pointer hover:bg-surface-soft"
            type="button"
            onClick={onClose}
            aria-label="Close lead journey details"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2.5} color="currentColor" />
          </button>
        </div>

        <div className="grid gap-5 px-[22px] pt-5 pb-[22px]">
          {editingField === "name" && (
            <section className="grid gap-2 p-4 border border-line rounded-2xl bg-white">
              <span className="text-xs font-extrabold text-muted uppercase">Lead Name</span>
              <input
                className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white"
                type="text"
                value={draftRecord.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer"
                  type="button"
                  onClick={handleFieldCancel}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} color="currentColor" />
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-1.5 min-h-[30px] px-[10px] border border-green rounded-lg bg-green text-ink text-xs font-black font-montserrat cursor-pointer"
                  type="button"
                  onClick={() => handleFieldSave("name")}
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.8} color="currentColor" />
                  Save
                </button>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
            <EditableFieldCard
              label="Email"
              field="email"
              value={record.email}
              draftValue={draftRecord.email}
              editingField={editingField}
              onStartEdit={setEditingField}
              onChange={handleFieldChange}
              onSave={handleFieldSave}
              onCancel={handleFieldCancel}
              type="email"
            />
            <EditableFieldCard
              label="Phone"
              field="phone"
              value={record.phone}
              draftValue={draftRecord.phone}
              editingField={editingField}
              onStartEdit={setEditingField}
              onChange={handleFieldChange}
              onSave={handleFieldSave}
              onCancel={handleFieldCancel}
            />
            <EditableFieldCard
              label="Client Type"
              field="clientType"
              value={record.clientType}
              draftValue={draftRecord.clientType}
              editingField={editingField}
              onStartEdit={setEditingField}
              onChange={handleFieldChange}
              onSave={handleFieldSave}
              onCancel={handleFieldCancel}
              type="select"
              options={["Indian", "NRI"]}
            />
            <EditableFieldCard
              label="Owner"
              field="owner"
              value={record.owner}
              draftValue={draftRecord.owner}
              editingField={editingField}
              onStartEdit={setEditingField}
              onChange={handleFieldChange}
              onSave={handleFieldSave}
              onCancel={handleFieldCancel}
            />
          </section>

          <section className="grid gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-montserrat">Lead Status</h3>
                <p className="m-0 mt-1 text-sm text-muted">Move this lead through the pipeline. Selecting Converted will trigger onboarding.</p>
              </div>
              {/* Current stage pill */}
              {(() => {
                const all = [...PIPELINE_STAGES, DEAD_STAGE];
                const current = all.find((s) => s.id === record.stage);
                return current ? (
                  <span className={`inline-flex items-center gap-1.5 min-h-[26px] rounded-full px-3 text-xs font-black whitespace-nowrap ${current.pillClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />
                    {current.label}
                  </span>
                ) : null;
              })()}
            </div>

            {/* Pipeline stepper */}
            <div className="relative">

              <div className="relative z-[1] grid grid-cols-3 gap-3 mobile:grid-cols-1">
                {PIPELINE_STAGES.map((stage: any) => {
                  const isActive = record.stage === stage.id;
                  const isConverted = stage.id === "Converted";

                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() =>
                        isConverted
                          ? onConvert({ ...record, stage: "Converted" })
                          : onSave({ ...record, stage: stage.id })
                      }
                      className={`group relative flex flex-col items-center gap-2 p-4 border-2 rounded-2xl text-center transition-all duration-200 cursor-pointer ${
                        isActive
                          ? `${stage.activeClass} shadow-[0_4px_16px_rgba(0,0,0,0.08)]`
                          : "border-line bg-white hover:border-[rgba(46,222,190,0.35)] hover:bg-[rgba(46,222,190,0.03)]"
                      }`}
                    >
                      {/* Icon circle */}
                      <span className={`grid w-10 h-10 place-items-center rounded-full transition-colors duration-200 ${isActive ? stage.iconBg : "bg-[rgba(0,0,0,0.05)] group-hover:bg-[rgba(46,222,190,0.1)]"}`}>
                        <HugeiconsIcon
                          icon={stage.icon}
                          size={18}
                          strokeWidth={2.5}
                          className={isActive ? "" : "opacity-50 group-hover:opacity-80"}
                        />
                      </span>

                      <div>
                        <strong className="block text-sm">{stage.label}</strong>
                        <span className="block mt-0.5 text-xs text-muted leading-[1.4]">{stage.desc}</span>
                      </div>

                      {isConverted && (
                        <span className="inline-flex items-center min-h-[18px] px-2 rounded-full bg-green text-ink text-[9px] font-black uppercase tracking-wide">
                          → Triggers onboarding
                        </span>
                      )}

                      {isActive && (
                        <span className={`absolute top-2 right-2 w-2 h-2 rounded-full ${stage.dotColor} shadow-[0_0_0_3px_rgba(255,255,255,0.8)]`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dead Prospect — separate exit card */}
            <button
              type="button"
              onClick={() => onSave({ ...record, stage: "Dead Prospect" })}
              className={`flex items-center gap-3 w-full p-3 border-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                record.stage === "Dead Prospect"
                  ? `${DEAD_STAGE.activeClass} shadow-[0_2px_8px_rgba(0,0,0,0.06)]`
                  : "border-dashed border-[rgba(180,180,180,0.5)] bg-white hover:border-[rgba(180,180,180,0.9)] hover:bg-[#fafafa]"
              }`}
            >
              <span className={`grid w-8 h-8 place-items-center rounded-lg shrink-0 ${record.stage === "Dead Prospect" ? DEAD_STAGE.iconBg : "bg-[rgba(0,0,0,0.04)]"}`}>
                <HugeiconsIcon icon={MinusSignIcon} size={14} strokeWidth={2.5} className="text-[#888]" />
              </span>
              <div className="flex-1">
                <strong className="block text-sm text-[#555]">Dead Prospect</strong>
                <span className="text-xs text-muted">Mark as stopped or inactive — removed from active pipeline</span>
              </div>
              {record.stage === "Dead Prospect" && (
                <span className={`inline-flex items-center gap-1 min-h-[22px] px-2 rounded-full text-[10px] font-black ${DEAD_STAGE.pillClass}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#aaa]" />
                  Current
                </span>
              )}
            </button>
          </section>

          <EditableFieldCard
            label="Quick Note"
            field="notes"
            value={record.notes || "No note added yet for this lead."}
            draftValue={draftRecord.notes || ""}
            editingField={editingField}
            onStartEdit={setEditingField}
            onChange={handleFieldChange}
            onSave={handleFieldSave}
            onCancel={handleFieldCancel}
            type="textarea"
          />
        </div>
      </div>
    </div>
  );
}
