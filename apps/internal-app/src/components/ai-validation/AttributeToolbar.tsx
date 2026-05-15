import React from "react";

export default function AttributeToolbar({ search, setSearch, completeness, setCompleteness }: any) {
  return (
    <div className="flex items-center flex-wrap gap-[10px] mb-3 mobile:flex-col mobile:items-stretch">
      <label className="flex items-center gap-2 min-w-[min(100%,280px)] h-10 px-3 border border-line rounded-lg bg-white">
        <span className="text-green text-xs font-black" aria-hidden="true">S</span>
        <input
          className="w-full border-0 outline-none bg-transparent"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search attributes"
        />
      </label>

      <div
        className="flex items-center gap-1 p-1 border border-line rounded-lg bg-white mobile:overflow-x-auto"
        aria-label="Completeness filter"
      >
        {["All", "Filled", "Null"].map((item) => (
          <button
            className={`min-h-[30px] px-[10px] border rounded-lg text-[13px] font-black cursor-pointer ${
              completeness === item
                ? "border-green bg-green text-ink"
                : "border-transparent bg-transparent text-muted"
            }`}
            key={item}
            type="button"
            onClick={() => setCompleteness(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
