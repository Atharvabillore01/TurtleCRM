import { useEffect, useMemo, useState } from "react";

export default function usePagination(items, pageSize = 5, resetKey = "") {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [currentPage, items, pageSize]);

  const startItem = items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = items.length === 0 ? 0 : Math.min(currentPage * pageSize, items.length);

  return {
    currentPage,
    endItem,
    paginatedItems,
    pageSize,
    setCurrentPage,
    startItem,
    totalItems: items.length,
    totalPages,
  };
}
