import React, { useEffect, useState } from "react";

export interface CountdownTimerProps {
  seconds:   number;
  onExpire?: () => void;
  style?:    React.CSSProperties;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  seconds,
  onExpire,
  style,
}) => {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onExpire]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const isUrgent = remaining <= 30;

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        fontSize: 14,
        color: isUrgent ? "#ef4444" : "#6b7280",
        ...style,
      }}
    >
      {mm}:{ss}
    </span>
  );
};
