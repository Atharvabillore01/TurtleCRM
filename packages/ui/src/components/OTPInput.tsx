import React, { useRef, useState, useCallback, ClipboardEvent, KeyboardEvent } from "react";

export interface OTPInputProps {
  length?:    number;
  onComplete: (otp: string) => void;
  disabled?:  boolean;
  error?:     boolean;
}

export const OTPInput: React.FC<OTPInputProps> = ({
  length   = 6,
  onComplete,
  disabled = false,
  error    = false,
}) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>(Array(length).fill(null));

  const focusAt = (index: number) => {
    refs.current[index]?.focus();
  };

  const submit = useCallback(
    (next: string[]) => {
      if (next.every((v) => v !== "")) {
        onComplete(next.join(""));
      }
    },
    [onComplete]
  );

  const handleChange = (index: number, raw: string) => {
    const char = raw.replace(/\D/g, "").slice(-1);
    const next = [...values];
    next[index] = char;
    setValues(next);
    if (char && index < length - 1) focusAt(index + 1);
    submit(next);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      const next = [...values];
      if (next[index]) {
        next[index] = "";
        setValues(next);
      } else if (index > 0) {
        next[index - 1] = "";
        setValues(next);
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusAt(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      focusAt(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    const next = [...values];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i] ?? "";
    }
    setValues(next);
    focusAt(Math.min(pasted.length, length - 1));
    submit(next);
  };

  const borderColor = error ? "#ef4444" : "#d1d5db";
  const focusBorder = error ? "#ef4444" : "#2563eb";

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={val}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          style={{
            width: 44,
            height: 52,
            textAlign: "center",
            fontSize: 20,
            fontWeight: 600,
            border: `2px solid ${borderColor}`,
            borderRadius: 8,
            outline: "none",
            caretColor: "transparent",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => { e.target.style.borderColor = focusBorder; }}
          onBlur={(e)  => { e.target.style.borderColor = borderColor; }}
        />
      ))}
    </div>
  );
};
