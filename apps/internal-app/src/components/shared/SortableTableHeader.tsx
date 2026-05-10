import React from "react";

export default function SortableTableHeader({
  label,
  sortKey,
  currentSortKey,
  sortDirection,
  onSort,
  icon,
  className = "",
}: any) {
  const isActive = sortKey === currentSortKey;
  const arrow = isActive ? (sortDirection === "asc" ? "^" : "v") : null;

  return (
    <th className={className} aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-1.5 w-full text-left text-ink transition-colors duration-150 hover:text-green"
        onClick={() => onSort(sortKey)}
      >
        {icon}
        <span>{label}</span>
        {arrow ? <span className="text-[11px]">{arrow}</span> : null}
      </button>
    </th>
  );
}
