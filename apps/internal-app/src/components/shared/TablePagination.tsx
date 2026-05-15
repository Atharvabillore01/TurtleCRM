import React from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import IconLabelButton from "./IconLabelButton";

function buildPages(currentPage: any, totalPages: any) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  return Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((first, second) => first - second);
}

export default function TablePagination({ currentPage, totalPages, startItem, endItem, totalItems, onPageChange }: any) {
  if (totalItems === 0) {
    return null;
  }

  const pages = buildPages(currentPage, totalPages);

  return (
    <div className="flex items-center justify-between gap-3 pt-4 mobile:flex-col mobile:items-start">
      <p className="m-0 text-muted text-xs">
        Showing {startItem}-{endItem} of {totalItems}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <IconLabelButton
          icon={ArrowLeft01Icon}
          className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Prev
        </IconLabelButton>

        {pages.map((page) => (
          <button
            key={page}
            className={`min-h-[30px] min-w-[34px] px-[10px] border rounded-lg text-xs font-black font-montserrat cursor-pointer ${
              page === currentPage ? "border-green bg-green text-ink" : "border-line bg-white text-ink"
            }`}
            type="button"
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}

        <IconLabelButton
          icon={ArrowRight01Icon}
          className="min-h-[30px] px-[10px] border border-line rounded-lg bg-white text-ink text-xs font-black font-montserrat cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </IconLabelButton>
      </div>
    </div>
  );
}
