import { useState } from "react";

const STORAGE_KEY = "turtle_dev_mode";

export function useDevMode() {
  const [devMode, setDevMode] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; }
    catch { return false; }
  });

  function toggle() {
    setDevMode((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }

  return { devMode, toggle };
}
