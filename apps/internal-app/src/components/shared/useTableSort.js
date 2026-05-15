import { useMemo, useState } from "react";

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return String(value).trim();
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortItems(items, sortKey, sortDirection, accessor = (item, key) => item[key]) {
  if (!sortKey || sortDirection === "none") {
    return items;
  }

  return [...items].sort((first, second) => {
    const left = normalizeValue(accessor(first, sortKey));
    const right = normalizeValue(accessor(second, sortKey));

    const comparison = compareValues(left, right);
    return sortDirection === "asc" ? comparison : -comparison;
  });
}

export function useTableSort(defaultKey = null, defaultDirection = "asc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDirection, setSortDirection] = useState(defaultDirection);

  const handleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }

    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }

    if (sortDirection === "desc") {
      setSortKey(null);
      setSortDirection("none");
      return;
    }

    setSortDirection("asc");
  };

  const applySort = useMemo(
    () => (items, accessor) => sortItems(items, sortKey, sortDirection, accessor),
    [sortKey, sortDirection],
  );

  return { sortKey, sortDirection, handleSort, applySort };
}
