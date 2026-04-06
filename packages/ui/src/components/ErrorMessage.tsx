import React from "react";

export interface ErrorMessageProps {
  message:   string;
  onDismiss?: () => void;
  style?:    React.CSSProperties;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onDismiss,
  style,
}) => {
  if (!message) return null;

  return (
    <div
      role="alert"
      style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:          10,
        padding:      "12px 16px",
        borderRadius: 8,
        background:   "#fef2f2",
        border:       "1px solid #fecaca",
        color:        "#dc2626",
        fontSize:     14,
        lineHeight:   1.5,
        ...style,
      }}
    >
      {/* Error icon */}
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, marginTop: 1 }}>
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0v-4a.75.75 0 00-1.5 0v4zm.75 2.5a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          style={{
            background:  "none",
            border:      "none",
            cursor:      "pointer",
            color:       "#dc2626",
            padding:     0,
            lineHeight:  1,
            flexShrink:  0,
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
