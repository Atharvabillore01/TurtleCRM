import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { setAxiosToken } from "../api/axios.js";

interface AuthState {
  accessToken:     string | null;
  isAuthenticated: boolean;
  userType:        "client";
}

export interface AuthContextValue extends AuthState {
  login:   (accessToken: string) => void;
  logout:  () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// Parse JWT exp without a library
function parseJWTExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const exp = parseJWTExp(token);
  if (!exp) return true;
  return Date.now() >= exp * 1000 - 30_000; // 30s buffer
}

function secondsUntilExpiry(token: string): number {
  const exp = parseJWTExp(token);
  if (!exp) return 0;
  return Math.max(0, exp - Math.floor(Date.now() / 1000) - 30);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  };

  const scheduleRefresh = useCallback((token: string) => {
    clearRefreshTimer();
    const secs = secondsUntilExpiry(token);
    if (secs <= 0) return;

    refreshTimerRef.current = setTimeout(async () => {
      try {
        // refreshToken is in httpOnly cookie — browser sends it automatically
        const res = await fetch("http://localhost:4000/auth/refresh", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({}),
        });
        if (!res.ok) throw new Error("refresh failed");
        const data = (await res.json()) as { accessToken: string };
        login(data.accessToken);
      } catch {
        // Refresh failed — clear auth state
        setAccessToken(null);
        setAxiosToken(null);
      }
    }, secs * 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    (token: string) => {
      setAccessToken(token);
      setAxiosToken(token);
      scheduleRefresh(token);
    },
    [scheduleRefresh]
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    try {
      await fetch("http://localhost:4000/auth/logout", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({}),
      });
    } catch {
      // best-effort
    }
    setAccessToken(null);
    setAxiosToken(null);
  }, []);

  // On mount, attempt a silent refresh in case we have a valid refresh cookie
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("http://localhost:4000/auth/refresh", {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({}),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { accessToken: string };
        login(data.accessToken);
      } catch {
        // No valid session — stay logged out
      }
    })();
    return () => { cancelled = true; clearRefreshTimer(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken && !isTokenExpired(accessToken),
        userType:        "client",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
