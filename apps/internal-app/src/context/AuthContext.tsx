import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { authAxios, setAxiosToken, refreshAccessToken } from "../api/axios.js";
import type { JWTPayload } from "@turtle/types";

interface AuthState {
  accessToken:     string | null;
  isAuthenticated: boolean;
  isLoading:       boolean;
  userType:        "internal";
  userId:          string | null;
  email:           string | null;
  name:            string | null;
}

export interface AuthContextValue extends AuthState {
  login:  (accessToken: string) => void;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function parseJWT(token: string): (JWTPayload & { email?: string; name?: string }) | null {
  try {
    return JSON.parse(atob(token.split(".")[1]!)) as JWTPayload & { email?: string; name?: string };
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
  const [userId,      setUserId]      = useState<string | null>(null);
  const [email,       setEmail]       = useState<string | null>(null);
  const [name,        setName]        = useState<string | null>(null);
  const [isLoading,   setIsLoading]   = useState<boolean>(true);
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
        const token = await refreshAccessToken();
        login(token);
      } catch {
        setAccessToken(null);
        setAxiosToken(null);
        setUserId(null);
        setEmail(null);
        setName(null);
      }
    }, secs * 1000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    (token: string) => {
      const payload = parseJWT(token);
      setAccessToken(token);
      setAxiosToken(token);
      setUserId(payload?.userId ?? null);
      setEmail(payload?.email ?? null);
      setName(payload?.name ?? null);
      scheduleRefresh(token);
    },
    [scheduleRefresh]
  );

  const logout = useCallback(async () => {
    clearTimer();
    try {
      await authAxios.post("/auth/logout", {});
    } catch { /* best-effort */ }
    setAccessToken(null);
    setAxiosToken(null);
    setEmail(null);
    setName(null);
    setUserId(null);
  }, []);

  // On mount: attempt silent refresh to restore session from httpOnly cookie.
  // isLoading stays true until this resolves so ProtectedRoute doesn't flash-redirect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (cancelled) return;
        login(token);
      } catch (err: unknown) {
        // 401 → stale/orphaned refresh cookie. Clear it server-side so the
        // next page load doesn't repeat the same failed refresh.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          await authAxios.post("/auth/logout", {}).catch(() => { /* best-effort */ });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; clearTimer(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken && !isTokenExpired(accessToken),
        isLoading,
        userType:        "internal",
        userId,
        email,
        name,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
