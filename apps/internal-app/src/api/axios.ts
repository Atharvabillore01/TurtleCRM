import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

const BASE_URL         = import.meta.env["VITE_AUTH_SERVICE_URL"]    ?? "";
const USER_BASE_URL    = import.meta.env["VITE_USER_SERVICE_URL"]    ?? "";
const MEETING_BASE_URL = import.meta.env["VITE_MEETING_SERVICE_URL"] ?? "";

let _accessToken: string | null = null;
let _refreshPromise: Promise<string> | null = null;

export function setAxiosToken(token: string | null): void {
  _accessToken = token;
}

/**
 * Refresh the access token via the httpOnly refresh cookie — DEDUPLICATED.
 *
 * Concurrent callers (React StrictMode double-mounting the AuthProvider, the
 * scheduled pre-expiry refresh racing the 401 interceptor, multiple in-flight
 * requests all 401-ing at once) share ONE in-flight request. This is essential
 * because POST /auth/refresh ROTATES the refresh token (single-use): firing it
 * twice consumes the token and 401s the second call, which logged the user out
 * on every reload.
 */
export function refreshAccessToken(): Promise<string> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = axios
    .post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      const token = res.data.accessToken;
      setAxiosToken(token);
      return token;
    })
    .finally(() => {
      _refreshPromise = null;
    });
  return _refreshPromise;
}

export const authAxios: AxiosInstance = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,
  headers:         { "Content-Type": "application/json" },
});

authAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) config.headers.set("Authorization", `Bearer ${_accessToken}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── User-service axios (plain Bearer, no refresh retry needed) ───────────────

export const userAxios: AxiosInstance = axios.create({
  baseURL: USER_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

userAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) config.headers.set("Authorization", `Bearer ${_accessToken}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Meeting-service axios (Bearer + cookie credentials) ──────────────────────

export const meetingAxios: AxiosInstance = axios.create({
  baseURL:         MEETING_BASE_URL,
  withCredentials: true,
  headers:         { "Content-Type": "application/json" },
});

meetingAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) config.headers.set("Authorization", `Bearer ${_accessToken}`);
    return config;
  },
  (error) => Promise.reject(error)
);

authAxios.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes("/auth/refresh") ||
      original.url?.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      // Deduped: all concurrent 401s share one rotation (see refreshAccessToken).
      const newToken = await refreshAccessToken();
      original.headers.set("Authorization", `Bearer ${newToken}`);
      return authAxios(original);
    } catch (err) {
      setAxiosToken(null);
      return Promise.reject(err);
    }
  }
);
