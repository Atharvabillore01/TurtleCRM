import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";

export default function IconLabelButton({
  icon,
  children,
  className = "",
  iconSize = 14,
  strokeWidth = 1.8,
  iconClassName = "",
  ...props
}: any) {
  return (
    <button className={`inline-flex items-center gap-1.5 ${className}`.trim()} {...props}>
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          size={iconSize}
          strokeWidth={strokeWidth}
          color="currentColor"
          className={iconClassName}
        />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
