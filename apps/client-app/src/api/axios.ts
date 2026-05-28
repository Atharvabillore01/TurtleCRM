import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from "axios";

const BASE_URL = import.meta.env["VITE_AUTH_SERVICE_URL"] ?? "";

// Module-level token store — set by AuthContext, read by interceptor
let _accessToken: string | null = null;
let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

export function setAxiosToken(token: string | null): void {
  _accessToken = token;
}

function processQueue(token: string | null): void {
  _refreshQueue.forEach((cb) => cb(token));
  _refreshQueue = [];
}

export const authAxios: AxiosInstance = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true, // sends httpOnly refresh cookie
  headers:         { "Content-Type": "application/json" },
});

// ─── Request interceptor — attach Bearer token ────────────────────────────────

authAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) {
      config.headers.set("Authorization", `Bearer ${_accessToken}`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor — silent token refresh on 401 ──────────────────────

authAxios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Skip refresh loop for the refresh endpoint itself
    if (original.url?.includes("/auth/refresh") || original.url?.includes("/auth/logout")) {
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      // Queue this request until refresh completes
      return new Promise((resolve, reject) => {
        _refreshQueue.push((newToken) => {
          if (newToken) {
            original.headers.set("Authorization", `Bearer ${newToken}`);
            resolve(authAxios(original));
          } else {
            reject(error);
          }
        });
      });
    }

    original._retry   = true;
    _isRefreshing     = true;

    try {
      const res = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = res.data.accessToken;
      setAxiosToken(newToken);
      processQueue(newToken);
      original.headers.set("Authorization", `Bearer ${newToken}`);
      return authAxios(original);
    } catch (refreshError) {
      setAxiosToken(null);
      processQueue(null);
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  }
);
