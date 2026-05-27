import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";

export default function IconOnlyButton({
  icon,
  className = "",
  iconSize = 16,
  strokeWidth = 1.8,
  ...props
}: any) {
  return (
    <button
      className={`flex items-center justify-center transition-transform active:scale-95 ${className}`.trim()}
      {...props}
    >
      <HugeiconsIcon icon={icon} size={iconSize} strokeWidth={strokeWidth} color="currentColor" />
    </button>
  );
}
