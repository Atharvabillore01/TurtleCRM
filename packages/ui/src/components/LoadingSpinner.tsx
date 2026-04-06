import React from "react";

export interface LoadingSpinnerProps {
  size?:    number;
  color?:   string;
  label?:   string;
  style?:   React.CSSProperties;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size  = 24,
  color = "#15803d",
  label = "Loading…",
  style,
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ animation: "turtle-spin 0.8s linear infinite" }}
      >
        <style>{`@keyframes turtle-spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeOpacity="0.2" />
        <path
          d="M12 2 a10 10 0 0 1 10 10"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span style={{ fontSize: 14, color: "#6b7280" }}>{label}</span>
      )}
    </div>
  );
};
