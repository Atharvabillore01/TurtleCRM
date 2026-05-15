import React from "react";

export default function SearchableMultiPicker({
  label,
  placeholder,
  items,
  selectedItems,
  search,
  onSearchChange,
  onToggleItem,
}: any) {
  return (
    <div className="col-span-2 grid gap-3 mobile:col-span-1">
      <label className="grid gap-2">
        <span className="text-xs font-extrabold text-muted uppercase">{label}</span>
        <input
          className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedItems.map((item: any) => (
            <button
              className="inline-flex items-center gap-2 min-h-[34px] px-3 border border-[rgba(46,222,190,0.35)] rounded-full bg-[#d8fff6] text-[#0f6e5d] text-xs font-extrabold cursor-pointer"
              key={item.id}
              type="button"
              onClick={() => onToggleItem(item)}
            >
              <span>{item.name}</span>
              <strong className="text-xs">{"✕"}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        {items.map((item: any) => {
          const isSelected = selectedItems.some((selected: any) => selected.id === item.id);

          return (
            <button
              className={`grid gap-1 w-full px-[14px] py-3 border rounded-xl text-left transition-[border-color,background,box-shadow] duration-[160ms] ease-in cursor-pointer ${
                isSelected
                  ? "border-green bg-[#f2fffb] shadow-[inset_0_0_0_1px_rgba(46,222,190,0.24)]"
                  : "border-line bg-gradient-to-b from-white to-[#fbfffe] hover:border-[rgba(46,222,190,0.45)]"
              }`}
              key={item.id}
              type="button"
              onClick={() => onToggleItem(item)}
            >
              <strong>{item.name}</strong>
              <span className="text-muted text-xs">{isSelected ? "Selected for this call" : "Click to add"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
