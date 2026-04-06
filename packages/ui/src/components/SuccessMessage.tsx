import React from "react";

export interface SuccessMessageProps {
  message:    string;
  onDismiss?: () => void;
  style?:     React.CSSProperties;
}

export const SuccessMessage: React.FC<SuccessMessageProps> = ({
  message,
  onDismiss,
  style,
}) => {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        padding:      "12px 16px",
        borderRadius: 8,
        background:   "#f0fdf4",
        border:       "1px solid #bbf7d0",
        color:        "#15803d",
        fontSize:     14,
        lineHeight:   1.5,
        ...style,
      }}
    >
      {/* Checkmark icon */}
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border:     "none",
            cursor:     "pointer",
            color:      "#15803d",
            padding:    0,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
};
