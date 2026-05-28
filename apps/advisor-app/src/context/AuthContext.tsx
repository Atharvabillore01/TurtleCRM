import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { setAxiosToken } from "../api/axios.js";
import type { JWTPayload } from "@turtle/types";

interface AuthState {
  accessToken:     string | null;
  isAuthenticated: boolean;
  userType:        "advisor";
  role:            string | null;
}

export interface AuthContextValue extends AuthState {
  login:  (accessToken: string) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function parseJWT(token: string): JWTPayload | null {
  try {
    return JSON.parse(atob(token.split(".")[1]!)) as JWTPayload;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload?.exp) return true;
  return Date.now() >= payload.exp * 1000 - 30_000;
}

function secondsUntilExpiry(token: string): number {
  const payload = parseJWT(token);
  if (!payload?.exp) return 0;
  return Math.max(0, payload.exp - Math.floor(Date.now() / 1000) - 30);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role,        setRole]        = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  };

  const scheduleRefresh = useCallback((token: string) => {
    clearTimer();
    const secs = secondsUntilExpiry(token);
    if (secs <= 0) return;
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/auth/refresh", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({}),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { accessToken: string };
        login(data.accessToken);
      } catch {
        setAccessToken(null);
        setAxiosToken(null);
        setRole(null);
      }
    }, secs * 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    (token: string) => {
      const payload = parseJWT(token);
      setAccessToken(token);
      setAxiosToken(token);
      setRole(payload?.role ?? null);
      scheduleRefresh(token);
    },
    [scheduleRefresh]
  );

  const logout = useCallback(async () => {
    clearTimer();
    try {
      await fetch("/auth/logout", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({}),
      });
    } catch { /* best-effort */ }
    setAccessToken(null);
    setAxiosToken(null);
    setRole(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/auth/refresh", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({}),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { accessToken: string };
        login(data.accessToken);
      } catch { /* no valid session */ }
    })();
    return () => { cancelled = true; clearTimer(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken && !isTokenExpired(accessToken),
        userType:        "advisor",
        role,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
