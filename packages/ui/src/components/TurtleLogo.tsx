import React from "react";

export interface TurtleLogoProps {
  size?:      number;
  showText?:  boolean;
  style?:     React.CSSProperties;
}

export const TurtleLogo: React.FC<TurtleLogoProps> = ({
  size     = 48,
  showText = true,
  style,
}) => {
  return (
    <div
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        10,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Turtle Corporate logo"
      >
        {/* Shell */}
        <ellipse cx="32" cy="32" rx="18" ry="14" fill="#15803d" />
        {/* Shell pattern */}
        <ellipse cx="32" cy="32" rx="10" ry="8" fill="#16a34a" />
        <line x1="32" y1="18" x2="32" y2="46" stroke="#14532d" strokeWidth="1.5" />
        <line x1="14" y1="32" x2="50" y2="32" stroke="#14532d" strokeWidth="1.5" />
        <line x1="19" y1="21" x2="45" y2="43" stroke="#14532d" strokeWidth="1" />
        <line x1="45" y1="21" x2="19" y2="43" stroke="#14532d" strokeWidth="1" />
        {/* Head */}
        <ellipse cx="50" cy="28" rx="6" ry="5" fill="#22c55e" />
        {/* Eye */}
        <circle cx="52" cy="26" r="1.2" fill="#14532d" />
        {/* Front legs */}
        <ellipse cx="22" cy="17" rx="4" ry="3" fill="#22c55e" transform="rotate(-30 22 17)" />
        <ellipse cx="42" cy="17" rx="4" ry="3" fill="#22c55e" transform="rotate(30 42 17)" />
        {/* Back legs */}
        <ellipse cx="20" cy="46" rx="4" ry="3" fill="#22c55e" transform="rotate(30 20 46)" />
        <ellipse cx="44" cy="46" rx="4" ry="3" fill="#22c55e" transform="rotate(-30 44 46)" />
        {/* Tail */}
        <path d="M14 34 Q8 36 6 40" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>

      {showText && (
        <span
          style={{
            fontSize:   size * 0.35,
            fontWeight: 700,
            color:      "#14532d",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Turtle<br />
          <span style={{ fontWeight: 400, color: "#15803d" }}>Corporate</span>
        </span>
      )}
    </div>
  );
};
