import React from "react";

export default function PlaceholderModule({ title }: any) {
  return (
    <div className="grid gap-[18px]">
      <header className="flex items-start justify-between gap-4 mobile:flex-col">
        <div>
          <p className="text-green text-xs font-black uppercase font-montserrat m-0">{title}</p>
          <h1>{title}</h1>
          <p className="max-w-[720px] mt-[10px] mb-0 text-muted text-sm leading-[1.6]">
            This module is listed in the sidebar and ready for its dedicated screen next.
          </p>
        </div>
      </header>
    </div>
  );
}
