import { useMemo } from "react";

/**
 * Compact search-driven picker.
 *
 * UX rules:
 *  - Selected items always render as removable chips at the top.
 *  - Below the search input, the dropdown list ONLY appears when the user
 *    types something. Empty search → hint only (no 50-row dump).
 *  - List is filtered by name OR email (case-insensitive), capped to
 *    MAX_VISIBLE rows in a scrollable container.
 */
const MAX_VISIBLE = 8;

export default function SearchableMultiPicker({
  label,
  placeholder,
  items,
  selectedItems,
  search,
  onSearchChange,
  onToggleItem,
}: any) {
  const trimmed = (search || "").trim().toLowerCase();
  const allItems: any[] = items || [];
  const selected: any[] = selectedItems || [];

  const filtered = useMemo(() => {
    if (!trimmed) return [] as any[];
    return allItems.filter((item: any) => {
      const name = (item.name || "").toLowerCase();
      const email = (item.email || "").toLowerCase();
      return name.includes(trimmed) || email.includes(trimmed);
    });
  }, [allItems, trimmed]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const moreCount = filtered.length - visible.length;

  return (
    <div className="col-span-2 grid gap-3 mobile:col-span-1">
      <label className="grid gap-2">
        <span className="text-xs font-extrabold text-muted uppercase">
          {label}
          <span className="ml-1 text-muted font-normal normal-case">
            ({allItems.length} available)
          </span>
        </span>
        <input
          className="form-field w-full min-h-[42px] px-3 py-[10px] border border-line rounded-[10px] outline-none bg-white transition-[border-color,box-shadow] duration-[160ms] ease-in"
          value={search || ""}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item: any) => (
            <button
              className="inline-flex items-center gap-2 min-h-[30px] px-3 border border-[rgba(46,222,190,0.35)] rounded-full bg-[#d8fff6] text-[#0f6e5d] text-xs font-extrabold cursor-pointer hover:bg-[#c8f7eb]"
              key={item.id}
              type="button"
              onClick={() => onToggleItem(item)}
              title={item.email || ""}
            >
              <span>{item.name}</span>
              <span className="text-xs leading-none">✕</span>
            </button>
          ))}
        </div>
      )}

      {/* Results list — only when searching */}
      {trimmed === "" ? (
        <p className="text-muted text-xs m-0 px-1">
          {selected.length === 0
            ? `Start typing a name or email to search ${allItems.length} ${label.toLowerCase()}.`
            : `Search above to add more.`}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-xs m-0 px-1">
          No {label.toLowerCase()} match "{search}".
        </p>
      ) : (
        <>
          <p className="text-muted text-[11px] m-0 px-1">
            Showing {visible.length} of {filtered.length} match
            {filtered.length === 1 ? "" : "es"}
          </p>
          <div className="grid gap-1.5 max-h-[320px] overflow-y-auto border border-line rounded-xl bg-white p-1.5">
            {visible.map((item: any) => {
              const isSelected = selected.some((s: any) => s.id === item.id);
              return (
                <button
                  className={`grid grid-cols-[1fr_auto] items-center gap-2 w-full px-3 py-2 border rounded-lg text-left text-sm transition cursor-pointer ${
                    isSelected
                      ? "border-green bg-[#f2fffb]"
                      : "border-transparent hover:border-[rgba(46,222,190,0.45)] hover:bg-[#fbfffe]"
                  }`}
                  key={item.id}
                  type="button"
                  onClick={() => onToggleItem(item)}
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{item.name}</strong>
                    {item.email && (
                      <span className="block truncate text-[11px] text-muted">
                        {item.email}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                      isSelected
                        ? "bg-green text-ink"
                        : "bg-surface-soft text-muted"
                    }`}
                  >
                    {isSelected ? "Added" : "Add"}
                  </span>
                </button>
              );
            })}
            {moreCount > 0 && (
              <p className="text-muted text-[11px] text-center m-0 py-1">
                + {moreCount} more — refine your search to see them
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
